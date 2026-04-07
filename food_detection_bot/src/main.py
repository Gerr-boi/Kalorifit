import logging
import json
import time
import uuid
import io
import re
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.core.dish_classifier import create_dish_classifier
from src.core.detector import create_detector
from src.core.errors import BotError
from src.core.image_region import build_ocr_crop_candidates, crop_to_bbox, pick_detection_for_crop
from src.core.off_text_search import search_open_food_facts_by_text
from src.core.product_catalog import ProductCatalog
from src.core.types import TextDetection
from src.data_logger import DatasetLogger
from src.providers.text_provider import create_text_provider
from src.logging_setup import setup_logging
from src.schemas import (
    DetectResponse,
    ErrorResponse,
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    LogScanResponse,
)
from src.utils.image_io import load_image_from_bytes
from src.utils.model_fingerprint import sha256_file

settings = get_settings()
setup_logging(settings.log_level)
logger = logging.getLogger('food_detection_bot')

app = FastAPI(title='Food Detection Bot', version=settings.version)
started_at = time.time()


def _clean_ocr_text(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = re.sub(r'[^\w\s\-]', ' ', lowered, flags=re.UNICODE)
    return ' '.join(cleaned.split())


def _to_jpeg_bytes(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=92)
    return buffer.getvalue()


@app.on_event('startup')
def startup_event() -> None:
    detector = create_detector(settings)
    text_provider = create_text_provider(settings.text_provider)
    dish_classifier = create_dish_classifier(settings.dish_classifier_enabled, settings.dish_classifier_model_path)
    product_catalog = ProductCatalog(settings.product_catalog_path)
    text_status = text_provider.status()
    dish_status = dish_classifier.status()
    app.state.detector = detector
    app.state.text_provider = text_provider
    app.state.dish_classifier = dish_classifier
    app.state.product_catalog = product_catalog
    app.state.text_provider_status = text_status
    app.state.dish_classifier_status = dish_status
    app.state.model_loaded = True
    app.state.dataset_logger = DatasetLogger(settings.dataset_dir)
    model_loaded_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    model_weights_path = getattr(detector, 'weights_path', None)
    model_weights_sha256 = sha256_file(model_weights_path)
    app.state.model_loaded_at = model_loaded_at
    app.state.model_weights_path = model_weights_path
    app.state.model_weights_sha256 = model_weights_sha256
    logger.info(
        'Detector initialized provider=%s model=%s text_provider=%s text_enabled=%s text_available=%s text_message=%s',
        settings.provider,
        detector.model_id,
        text_provider.model_id,
        settings.text_detection_enabled,
        text_status.get('available'),
        text_status.get('message'),
    )
    logger.info(
        'Dish classifier initialized enabled=%s available=%s model=%s message=%s',
        settings.dish_classifier_enabled,
        dish_status.get('available'),
        dish_classifier.model_id,
        dish_status.get('message'),
    )
    logger.info(
        'Model fingerprint model_id=%s model_weights_path=%s model_weights_sha256=%s model_loaded_at=%s',
        detector.model_id,
        model_weights_path,
        model_weights_sha256,
        model_loaded_at,
    )
    logger.info('Product catalog loaded path=%s size=%s', settings.product_catalog_path, product_catalog.size)


def _parse_label_set(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {token.strip().lower() for token in raw.split(',') if token.strip()}


@app.exception_handler(BotError)
async def bot_error_handler(request: Request, exc: BotError):
    request_id = request.headers.get('x-scan-request-id') or str(uuid.uuid4())
    payload = ErrorResponse(
        error=exc.code,
        message=exc.message,
        request_id=request_id,
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    request_id = request.headers.get('x-scan-request-id') or str(uuid.uuid4())
    logger.exception('Unhandled exception request_id=%s', request_id)
    payload = ErrorResponse(
        error='UNEXPECTED_SERVER_ERROR',
        message='Unexpected server error.',
        request_id=request_id,
    )
    return JSONResponse(status_code=500, content=payload.model_dump())


@app.get('/health', response_model=HealthResponse)
def health():
    detector = app.state.detector
    return HealthResponse(
        ok=True,
        version=settings.version,
        provider=settings.provider,
        model_loaded=bool(getattr(app.state, 'model_loaded', False)),
        model=getattr(detector, 'model_id', None),
        model_weights_path=getattr(app.state, 'model_weights_path', None),
        model_weights_sha256=getattr(app.state, 'model_weights_sha256', None),
        model_loaded_at=getattr(app.state, 'model_loaded_at', None),
        uptime_s=round(time.time() - started_at, 3),
    )


@app.post('/detect', response_model=DetectResponse)
async def detect(
    request: Request,
    image: UploadFile = File(...),
    scan_mode: str | None = Form(default=None),
    device_info: str | None = Form(default=None),
    rotation_degrees: int | None = Form(default=None),
    barcode: str | None = Form(default=None),
):
    request_id = request.headers.get('x-scan-request-id') or str(uuid.uuid4())

    image_bytes = await image.read()
    img = load_image_from_bytes(image_bytes, settings.max_image_bytes)

    detector = app.state.detector
    product_catalog: ProductCatalog = app.state.product_catalog
    result = detector.detect(img)
    filtered_detections = [d for d in result.detections if d.confidence >= settings.conf_threshold]
    package_detection, package_detection_strategy = pick_detection_for_crop(
        filtered_detections,
        settings.package_class_name,
        image_size=img.size,
        max_area_ratio=settings.fallback_crop_max_area_ratio,
        min_confidence=settings.fallback_crop_min_confidence,
        preferred_labels=_parse_label_set(settings.fallback_crop_preferred_labels),
    )
    crop_image = crop_to_bbox(img, package_detection.bbox if package_detection else None)
    package_crop_bytes = _to_jpeg_bytes(crop_image) if crop_image else None

    text_detections: list[TextDetection] = []
    ocr_rows: list[dict] = []
    ocr_tokens: list[str] = []
    ocr_crop_strategies: list[str] = []
    dish_predictions: list[dict] = []
    text_status = getattr(app.state, 'text_provider_status', {'available': False, 'message': 'uninitialized'})
    dish_status = getattr(app.state, 'dish_classifier_status', {'available': False, 'message': 'uninitialized'})
    if settings.text_detection_enabled:
        text_provider = app.state.text_provider
        ocr_crops = build_ocr_crop_candidates(
            img,
            filtered_detections,
            class_name=settings.package_class_name,
            max_area_ratio=settings.fallback_crop_max_area_ratio,
            min_confidence=settings.fallback_crop_min_confidence,
            preferred_labels=_parse_label_set(settings.fallback_crop_preferred_labels),
        )[: max(1, settings.max_ocr_crops)]
        ocr_crop_strategies = [name for name, _ in ocr_crops]
        merged_by_text: dict[str, dict] = {}
        for strategy_name, ocr_source in ocr_crops:
            for detection in text_provider.detect_text(ocr_source):
                text_value = str(detection.text or '').strip()
                if not text_value or detection.confidence < settings.text_conf_threshold:
                    continue
                normalized_text = _clean_ocr_text(text_value)
                if not normalized_text:
                    continue
                current = {
                    'text': text_value,
                    'confidence': detection.confidence,
                    'bbox': detection.bbox,
                    'source': strategy_name,
                    'normalized': normalized_text,
                }
                prev = merged_by_text.get(normalized_text)
                if not prev or current['confidence'] > prev['confidence']:
                    merged_by_text[normalized_text] = current

        ocr_rows = list(merged_by_text.values())
        text_detections = [TextDetection(text=row['text'], confidence=row['confidence'], bbox=row.get('bbox')) for row in ocr_rows]
        ocr_tokens = [row['normalized'] for row in ocr_rows]

    ranked_candidates = product_catalog.rank_candidates(ocr_lines=ocr_tokens, barcode=barcode, top_k=settings.top_k)
    top_candidate = ranked_candidates[0] if ranked_candidates else None
    top_candidate_conf = float(top_candidate.get('confidence', 0.0)) if top_candidate else 0.0
    top_candidate_reasons = top_candidate.get('reasons', []) if top_candidate else []
    has_barcode_exact = bool(top_candidate and 'barcode_exact' in top_candidate_reasons)
    avg_ocr_confidence = (
        sum(float(row.get('confidence', 0.0)) for row in ocr_rows) / max(1, len(ocr_rows))
        if ocr_rows
        else 0.0
    )
    unique_ocr_tokens = len(set(ocr_tokens))
    retry_reasons: list[str] = []
    if not has_barcode_exact:
        if unique_ocr_tokens < settings.ocr_min_unique_tokens_for_resolve:
            retry_reasons.append('low_ocr_token_coverage')
        if avg_ocr_confidence < settings.ocr_avg_confidence_min:
            retry_reasons.append('low_ocr_confidence')
        if top_candidate_conf < settings.catalog_confidence_min_for_autoresolve:
            retry_reasons.append('low_catalog_confidence')

    needs_recapture = len(retry_reasons) > 0
    retry_guidance = None
    if needs_recapture:
        if 'low_ocr_confidence' in retry_reasons:
            retry_guidance = 'Move closer, reduce glare, and capture the front label.'
        elif 'low_ocr_token_coverage' in retry_reasons:
            retry_guidance = 'Center the package label and keep text fully visible.'
        else:
            retry_guidance = 'Retake the photo with better lighting and focus.'

    visible_candidates = ranked_candidates if not needs_recapture else []
    if not visible_candidates and settings.enable_off_text_search_fallback and ocr_tokens:
        off_query = ' '.join(dict.fromkeys(ocr_tokens))[:180]
        off_candidates = await search_open_food_facts_by_text(off_query, top_k=settings.off_text_search_top_k)
        visible_candidates = [
            {
                'product_id': candidate.get('code') or f"off:{candidate.get('name')}",
                'name': candidate.get('name'),
                'brand': candidate.get('brand'),
                'product_name': candidate.get('name'),
                'confidence': candidate.get('confidence', 0.0),
                'reasons': ['ocr_off_text_search'],
                'barcode': candidate.get('code'),
            }
            for candidate in off_candidates
            if candidate.get('name')
        ]
        if visible_candidates:
            needs_recapture = False
            retry_reasons = []
            retry_guidance = None
    predicted_product = visible_candidates[0]['name'] if visible_candidates else None
    if settings.dish_classifier_enabled:
        dish_classifier = app.state.dish_classifier
        dish_predictions = dish_classifier.predict(img, top_k=settings.dish_classifier_top_k)
    items = [
        {
            'name': candidate['name'],
            'confidence': candidate['confidence'],
            'count': 1,
            'brand': candidate.get('brand'),
            'product_name': candidate.get('product_name'),
            'product_id': candidate.get('product_id'),
            'reasons': candidate.get('reasons', []),
        }
        for candidate in visible_candidates
    ]
    scan_log_id: str | None = None

    if settings.enable_scan_logging:
        try:
            dataset_logger: DatasetLogger = app.state.dataset_logger
            log_record = dataset_logger.log_scan(
                image_bytes=image_bytes,
                package_crop_bytes=package_crop_bytes if settings.enable_package_crop_logging else None,
                mime_type=image.content_type,
                predictions=[
                    {
                        'label': d.label,
                        'confidence': d.confidence,
                        'bbox': d.bbox,
                    }
                    for d in filtered_detections
                ],
                ocr=ocr_tokens,
                ocr_entries=ocr_rows,
                barcode=barcode,
                predicted_product=predicted_product,
                predicted_candidates=visible_candidates,
                context={
                    'scan_mode': scan_mode,
                    'device_info': device_info,
                    'rotation_degrees': rotation_degrees,
                },
                request_id=request_id,
                model=result.model_id,
                latency_ms=result.latency_ms,
            )
            scan_log_id = str(log_record.get('scan_log_id'))
        except Exception:
            logger.exception('Failed to persist scan dataset row request_id=%s', request_id)

    response = DetectResponse(
        ok=True,
        model=result.model_id,
        latency_ms=result.latency_ms,
        items=items,
        detections=[
            {
                'label': d.label,
                'confidence': d.confidence,
                'bbox': d.bbox,
            }
            for d in filtered_detections
        ],
        text_detections=[
            {
                'text': t.text,
                'confidence': t.confidence,
                'bbox': t.bbox,
            }
            for t in text_detections
        ],
        barcode_result=barcode,
        predicted_product=predicted_product,
        package_detection=(
            {
                'label': package_detection.label,
                'confidence': package_detection.confidence,
                'bbox': package_detection.bbox,
            }
            if package_detection
            else None
        ),
        scan_log_id=scan_log_id,
        debug={
            'api_keys_logged': ['items', 'detections', 'text_detections', 'model', 'latency_ms'],
            'ocr_token_count': len(ocr_tokens),
            'ocr_unique_token_count': unique_ocr_tokens,
            'ocr_average_confidence': round(avg_ocr_confidence, 4),
            'ocr_crop_strategies': ocr_crop_strategies,
            'dish_predictions': dish_predictions,
            'dish_classifier_available': dish_status.get('available'),
            'dish_classifier_message': dish_status.get('message'),
            'top_catalog_confidence': round(top_candidate_conf, 4),
            'top_catalog_reasons': top_candidate_reasons,
            'label_resolution_state': 'needs_recapture' if needs_recapture else 'ready',
            'retry_reasons': retry_reasons,
            'retry_guidance': retry_guidance,
            'text_provider_available': text_status.get('available'),
            'text_provider_message': text_status.get('message'),
            'catalog_size': product_catalog.size,
            'package_detected': package_detection is not None,
            'package_detection_strategy': package_detection_strategy,
            'used_crop_for_ocr': len(ocr_crop_strategies) > 1,
            'crop_pick_label': package_detection.label if package_detection else None,
            'crop_pick_confidence': package_detection.confidence if package_detection else None,
            'crop_pick_bbox': package_detection.bbox if package_detection else None,
            'fallback_crop_max_area_ratio': settings.fallback_crop_max_area_ratio,
            'fallback_crop_min_confidence': settings.fallback_crop_min_confidence,
            'fallback_crop_preferred_labels': settings.fallback_crop_preferred_labels,
            'ocr_min_unique_tokens_for_resolve': settings.ocr_min_unique_tokens_for_resolve,
            'ocr_avg_confidence_min': settings.ocr_avg_confidence_min,
            'catalog_confidence_min_for_autoresolve': settings.catalog_confidence_min_for_autoresolve,
            'model_weights_path': getattr(app.state, 'model_weights_path', None),
            'model_weights_sha256': getattr(app.state, 'model_weights_sha256', None),
            'model_loaded_at': getattr(app.state, 'model_loaded_at', None),
        },
    )

    logger.info(
        'detect request_id=%s bytes=%s detections=%s items=%s text_detections=%s response_keys=%s',
        request_id,
        len(image_bytes),
        len(filtered_detections),
        len(items),
        len(text_detections),
        sorted(response.model_dump().keys()),
    )
    return response


def _safe_json_list(raw_value: str | None) -> list:
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


@app.post('/log-scan', response_model=LogScanResponse)
async def log_scan(
    request: Request,
    image: UploadFile = File(...),
    predictions: str | None = Form(default=None),
    ocr: str | None = Form(default=None),
    barcode: str | None = Form(default=None),
    scan_mode: str | None = Form(default=None),
    device_info: str | None = Form(default=None),
    rotation_degrees: int | None = Form(default=None),
    model: str | None = Form(default=None),
    latency_ms: int | None = Form(default=None),
):
    request_id = request.headers.get('x-scan-request-id') or str(uuid.uuid4())
    image_bytes = await image.read()
    _ = load_image_from_bytes(image_bytes, settings.max_image_bytes)

    dataset_logger: DatasetLogger = app.state.dataset_logger
    record = dataset_logger.log_scan(
        image_bytes=image_bytes,
        package_crop_bytes=None,
        mime_type=image.content_type,
        predictions=_safe_json_list(predictions),
        ocr=[str(token) for token in _safe_json_list(ocr)],
        ocr_entries=[],
        barcode=barcode,
        predicted_product=None,
        predicted_candidates=[],
        context={
            'scan_mode': scan_mode,
            'device_info': device_info,
            'rotation_degrees': rotation_degrees,
        },
        request_id=request_id,
        model=model,
        latency_ms=latency_ms,
    )
    return LogScanResponse(
        ok=True,
        scan_log_id=record['scan_log_id'],
        image_path=record['image_path'],
        created_at=record['created_at'],
    )


@app.post('/feedback', response_model=FeedbackResponse)
async def feedback(payload: FeedbackRequest):
    dataset_logger: DatasetLogger = app.state.dataset_logger
    try:
        updated = dataset_logger.update_feedback(
            scan_log_id=payload.scan_log_id,
            user_confirmed=payload.user_confirmed,
            user_corrected_to=payload.user_corrected_to,
            not_food=payload.not_food,
            bad_photo=payload.bad_photo,
            feedback_notes=payload.feedback_notes,
        )
    except FileNotFoundError as exc:
        raise BotError(
            status_code=404,
            code='SCAN_LOG_NOT_FOUND',
            message=f'No scan log found for id={exc.args[0]}',
        ) from exc

    return FeedbackResponse(
        ok=True,
        scan_log_id=payload.scan_log_id,
        updated_at=updated.get('updated_at', ''),
    )
