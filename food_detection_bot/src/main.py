import logging
import json
import time
import uuid
import io
import re
from typing import Any
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.core.dish_classifier import create_dish_classifier
from src.core.detector import create_detector
from src.core.errors import BotError
from src.core.image_region import crop_to_bbox, pick_detection_for_crop
from src.core.product_catalog import ProductCatalog
from src.core.types import TextDetection
from src.data_logger import DatasetLogger
from src.providers.text_provider import create_text_provider
from src.logging_setup import setup_logging
from src.schemas import (
    DetectResponse,
    DishPredictResponse,
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

OCR_HIGH_VALUE_PACKAGING = {'can', 'bottle', 'carton', 'wrapper', 'pouch'}
PACKAGING_TYPE_MAP = {
    'bottle': 'bottle',
    'wine bottle': 'bottle',
    'beer bottle': 'bottle',
    'cup': 'bowl',
    'bowl': 'bowl',
    'plate': 'plate',
    'tray': 'plate',
    'can': 'can',
    'soda can': 'can',
    'carton': 'carton',
    'box': 'carton',
    'package': 'wrapper',
    'packet': 'wrapper',
    'pouch': 'pouch',
    'bag': 'pouch',
    'wrapper': 'wrapper',
}


def _clean_ocr_text(value: str) -> str:
    lowered = value.strip().lower()
    lowered = (
        lowered.replace('æ', 'ae')
        .replace('ø', 'o')
        .replace('å', 'a')
        .replace('0', 'o')
        .replace('|', 'l')
    )
    cleaned = re.sub(r'[^\w\s\-%\.]', ' ', lowered, flags=re.UNICODE)
    normalized = ' '.join(cleaned.split())
    for stop_phrase in ('new', 'limited edition', 'limited', 'edition', 'since 1886', 'recycle me'):
        normalized = normalized.replace(stop_phrase, ' ')
    return ' '.join(normalized.split())


def _to_jpeg_bytes(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=92)
    return buffer.getvalue()


def _merge_text_detections(detections: list[TextDetection]) -> list[TextDetection]:
    best_by_text: dict[str, TextDetection] = {}
    for item in detections:
        text = _clean_ocr_text(str(item.text or ''))
        if not text:
            continue
        confidence = float(item.confidence or 0.0)
        bbox = item.bbox
        prev = best_by_text.get(text)
        if prev is None or confidence > prev.confidence:
            best_by_text[text] = TextDetection(text=text, confidence=confidence, bbox=bbox)
    return sorted(best_by_text.values(), key=lambda row: row.confidence, reverse=True)


def _infer_packaging_type(detections) -> tuple[str | None, dict[str, float]]:
    scores: dict[str, float] = {}
    for detection in detections:
        normalized = PACKAGING_TYPE_MAP.get((detection.label or '').strip().lower())
        if not normalized:
            continue
        scores[normalized] = max(scores.get(normalized, 0.0), float(detection.confidence or 0.0))
    if not scores:
        return None, {}
    packaging_type = max(scores.items(), key=lambda row: row[1])[0]
    return packaging_type, scores


def _crop_center_region(image, width_ratio: float = 0.72, height_ratio: float = 0.68):
    width, height = image.size
    crop_width = max(1, int(width * width_ratio))
    crop_height = max(1, int(height * height_ratio))
    left = max(0, (width - crop_width) // 2)
    top = max(0, (height - crop_height) // 2)
    right = min(width, left + crop_width)
    bottom = min(height, top + crop_height)
    return image.crop((left, top, right, bottom))


def _prepare_ocr_regions(full_image, crop_image, packaging_type: str | None):
    regions: list[tuple[str, Any]] = []
    if crop_image is not None:
        regions.append(('crop_full', crop_image))
        if packaging_type in OCR_HIGH_VALUE_PACKAGING:
            regions.append(('crop_center', _crop_center_region(crop_image)))
    if full_image is not None and packaging_type in {'can', 'bottle', 'carton'}:
        regions.append(('frame_center', _crop_center_region(full_image, 0.64, 0.7)))
    if full_image is not None and not regions:
        regions.append(('frame_full', full_image))
    return regions


def _extract_structured_ocr_fields(ocr_rows: list[dict], text_detections: list[TextDetection]) -> dict[str, Any]:
    tokens = [_clean_ocr_text(row.get('text', '')) for row in ocr_rows]
    blob = ' '.join(token for token in tokens if token)
    brand = None
    product_name = None
    volume_ml = None
    abv = None
    kcal = None

    volume_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(ml|l)\b', blob)
    if volume_match:
        numeric = float(volume_match.group(1).replace(',', '.'))
        volume_ml = int(round(numeric * 1000)) if volume_match.group(2) == 'l' else int(round(numeric))
    abv_match = re.search(r'(\d+(?:[.,]\d+)?)\s*%', blob)
    if abv_match:
        abv = float(abv_match.group(1).replace(',', '.'))
    kcal_match = re.search(r'(\d{1,4})\s*kcal\b', blob)
    if kcal_match:
        kcal = int(kcal_match.group(1))

    for det in text_detections:
        text = _clean_ocr_text(det.text)
        if not text:
            continue
        if brand is None and len(text.split()) <= 2 and det.confidence >= 0.6:
            brand = text
        if product_name is None and len(text.split()) <= 4 and det.confidence >= 0.55:
            product_name = text

    flavor = None
    for hint in ('zero', 'max', 'original', 'cola', 'orange', 'lemon', 'lime', 'mango', 'berry', 'vanilla'):
        if hint in blob:
            flavor = hint if flavor is None else f'{flavor} {hint}'

    sugar_free = None
    if any(token in blob for token in ('zero', 'sugar free', 'sukkerfri', 'light', 'max')):
        sugar_free = True
    elif any(token in blob for token in ('original', 'regular', 'classic')):
        sugar_free = False

    return {
        'brand': brand,
        'product_name': product_name,
        'flavor': flavor,
        'volume_ml': volume_ml,
        'abv': abv,
        'kcal': kcal,
        'sugar_free': sugar_free,
    }


def _label_hint_scores(detections) -> dict[str, float]:
    scores: dict[str, float] = {}
    for detection in detections:
        label = _clean_ocr_text(detection.label or '')
        if not label:
            continue
        scores[label] = max(scores.get(label, 0.0), float(detection.confidence or 0.0))
    return scores


@app.on_event('startup')
def startup_event() -> None:
    detector = create_detector(settings)
    dish_classifier = create_dish_classifier(settings.dish_classifier_enabled, settings.dish_classifier_model_path)
    text_provider = create_text_provider(settings.text_provider)
    product_catalog = ProductCatalog(settings.product_catalog_path)
    text_status = text_provider.status()
    app.state.detector = detector
    app.state.dish_classifier = dish_classifier
    app.state.text_provider = text_provider
    app.state.product_catalog = product_catalog
    app.state.text_provider_status = text_status
    app.state.dish_classifier_status = dish_classifier.status()
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
        app.state.dish_classifier_status.get('available'),
        dish_classifier.model_id,
        app.state.dish_classifier_status.get('message'),
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


def _is_non_food_detection_label(label: str) -> bool:
    normalized = (label or '').strip().lower()
    if not normalized:
        return True
    blocked = {
        'person', 'human', 'man', 'woman', 'boy', 'girl',
        'car', 'truck', 'bus', 'train', 'motorcycle', 'bicycle', 'bike', 'vehicle',
        'tv', 'television', 'monitor', 'screen', 'laptop', 'computer', 'keyboard', 'mouse',
        'phone', 'cell phone', 'remote',
        'chair', 'sofa', 'couch', 'bed', 'table',
        'book', 'clock', 'vase', 'toothbrush', 'hair drier',
    }
    return normalized in blocked


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
    filtered_detections = [
        d
        for d in result.detections
        if d.confidence >= settings.conf_threshold and not _is_non_food_detection_label(d.label)
    ]
    non_food_filtered_count = max(0, len(result.detections) - len(filtered_detections))
    packaging_type, packaging_scores = _infer_packaging_type(filtered_detections)
    package_detection, package_detection_strategy = pick_detection_for_crop(
        filtered_detections,
        settings.package_class_name,
        image_size=img.size,
        max_area_ratio=settings.fallback_crop_max_area_ratio,
        min_confidence=settings.fallback_crop_min_confidence,
        preferred_labels=_parse_label_set(settings.fallback_crop_preferred_labels),
    )
    crop_image = crop_to_bbox(img, package_detection.bbox if package_detection else None)
    ocr_source = crop_image or img
    package_crop_bytes = _to_jpeg_bytes(crop_image) if crop_image else None

    text_detections = []
    text_status = getattr(app.state, 'text_provider_status', {'available': False, 'message': 'uninitialized'})
    ocr_strategy = 'skipped'
    ocr_regions_used: list[str] = []
    if settings.text_detection_enabled and packaging_type in OCR_HIGH_VALUE_PACKAGING:
        text_provider = app.state.text_provider
        ocr_strategy = 'targeted_packaging'
        for region_name, region_image in _prepare_ocr_regions(img, crop_image, packaging_type):
            ocr_regions_used.append(region_name)
            text_detections.extend(text_provider.detect_text(region_image))
        text_detections = _merge_text_detections(text_detections)
    elif settings.text_detection_enabled and packaging_type is None and crop_image is not None:
        text_provider = app.state.text_provider
        ocr_strategy = 'fallback_crop_only'
        ocr_regions_used.append('crop_full')
        text_detections = _merge_text_detections(text_provider.detect_text(ocr_source))
    elif settings.text_detection_enabled:
        ocr_strategy = 'skipped_low_value_packaging'

    ocr_rows = [
        {
            'text': t.text,
            'confidence': t.confidence,
            'bbox': t.bbox,
        }
        for t in text_detections
        if t.text and t.confidence >= settings.text_conf_threshold
    ]
    ocr_tokens = [_clean_ocr_text(row['text']) for row in ocr_rows if _clean_ocr_text(row['text'])]
    structured_fields = _extract_structured_ocr_fields(ocr_rows, text_detections)
    visual_hints = [d.label for d in filtered_detections]
    visual_scores = _label_hint_scores(filtered_detections)
    strongest_detection = max(filtered_detections, key=lambda d: d.confidence).label if filtered_detections else None
    ranked_candidates = product_catalog.rank_candidates(
        ocr_lines=ocr_tokens,
        barcode=barcode,
        top_k=settings.top_k,
        packaging_type=packaging_type,
        visual_hints=visual_hints,
        brand_hint=structured_fields.get('brand') or strongest_detection,
        structured_fields=structured_fields,
        visual_score_by_label=visual_scores,
    )
    top_candidate = ranked_candidates[0] if ranked_candidates else None
    candidate_margin = (
        float(ranked_candidates[0]['confidence']) - float(ranked_candidates[1]['confidence'])
        if len(ranked_candidates) > 1
        else float(ranked_candidates[0]['confidence']) if ranked_candidates else 0.0
    )
    predicted_product = top_candidate['name'] if top_candidate and top_candidate.get('accepted') else (top_candidate['name'] if top_candidate and top_candidate['confidence'] >= 0.75 else None)
    items = [
        {
            'name': candidate['name'],
            'confidence': candidate['confidence'],
            'count': 1,
            'brand': candidate.get('brand'),
            'product_name': candidate.get('product_name'),
            'product_id': candidate.get('product_id'),
            'reasons': candidate.get('reasons', []),
            'evidence': candidate.get('evidence'),
            'packaging': candidate.get('packaging'),
            'volume_ml': candidate.get('volume_ml'),
            'accepted': candidate.get('accepted'),
        }
        for candidate in ranked_candidates
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
                predicted_candidates=ranked_candidates,
                analysis={
                    'packaging_type': packaging_type,
                    'ocr_strategy': ocr_strategy,
                    'top_match_confidence': top_candidate['confidence'] if top_candidate else None,
                    'top_match_margin': round(candidate_margin, 4) if top_candidate else None,
                    'top_match_accepted': bool(top_candidate.get('accepted')) if top_candidate else False,
                    'package_detection_strategy': package_detection_strategy,
                    'detected_labels': [d.label for d in filtered_detections],
                    'packaging_scores': packaging_scores,
                    'structured_ocr_fields': structured_fields,
                    'candidate_count': len(ranked_candidates),
                    'detection_count': len(filtered_detections),
                    'text_detection_count': len(text_detections),
                    'non_food_filtered_count': non_food_filtered_count,
                },
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
        packaging_type=packaging_type,
        package_detection=(
            {
                'label': package_detection.label,
                'confidence': package_detection.confidence,
                'bbox': package_detection.bbox,
            }
            if package_detection
            else None
        ),
        top_match=(
            {
                'product_id': top_candidate.get('product_id'),
                'name': top_candidate.get('name'),
                'brand': top_candidate.get('brand'),
                'product_name': top_candidate.get('product_name'),
                'confidence': top_candidate.get('confidence'),
                'reasons': top_candidate.get('reasons', []),
                'evidence': top_candidate.get('evidence'),
            }
            if top_candidate
            else None
        ),
        alternatives=[
            {
                'product_id': candidate.get('product_id'),
                'name': candidate.get('name'),
                'brand': candidate.get('brand'),
                'product_name': candidate.get('product_name'),
                'confidence': candidate.get('confidence'),
                'reasons': candidate.get('reasons', []),
                'evidence': candidate.get('evidence'),
            }
            for candidate in ranked_candidates[1:3]
        ],
        scan_log_id=scan_log_id,
        debug={
            'api_keys_logged': ['items', 'detections', 'text_detections', 'model', 'latency_ms'],
            'ocr_token_count': len(ocr_tokens),
            'ocr_strategy': ocr_strategy,
            'ocr_regions_used': ocr_regions_used,
            'text_provider_available': text_status.get('available'),
            'text_provider_message': text_status.get('message'),
            'catalog_size': product_catalog.size,
            'package_detected': package_detection is not None,
            'package_detection_strategy': package_detection_strategy,
            'packaging_type': packaging_type,
            'packaging_scores': packaging_scores,
            'used_crop_for_ocr': crop_image is not None,
            'crop_pick_label': package_detection.label if package_detection else None,
            'crop_pick_confidence': package_detection.confidence if package_detection else None,
            'crop_pick_bbox': package_detection.bbox if package_detection else None,
            'fallback_crop_max_area_ratio': settings.fallback_crop_max_area_ratio,
            'fallback_crop_min_confidence': settings.fallback_crop_min_confidence,
            'fallback_crop_preferred_labels': settings.fallback_crop_preferred_labels,
            'structured_ocr_fields': structured_fields,
            'top_match_confidence': top_candidate['confidence'] if top_candidate else None,
            'top_match_margin': round(candidate_margin, 4) if top_candidate else None,
            'top_match_accepted': bool(top_candidate.get('accepted')) if top_candidate else False,
            'alternatives': ranked_candidates[1:3],
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


@app.post('/predict-dish', response_model=DishPredictResponse)
async def predict_dish(
    request: Request,
    image: UploadFile = File(...),
    topk: int = Form(default=5),
):
    _ = request
    image_bytes = await image.read()
    img = load_image_from_bytes(image_bytes, settings.max_image_bytes)
    dish_classifier = app.state.dish_classifier
    predictions = dish_classifier.predict(img, top_k=max(1, min(10, int(topk))))
    return DishPredictResponse(
        ok=True,
        model=dish_classifier.model_id,
        results=[
            {
                'label': str(row.get('label') or '').strip(),
                'confidence': float(row.get('confidence') or 0.0),
                'source': str(row.get('source') or 'dish_classifier'),
            }
            for row in predictions
            if str(row.get('label') or '').strip()
        ],
    )


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
        analysis=None,
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
            feedback_context=payload.feedback_context,
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
