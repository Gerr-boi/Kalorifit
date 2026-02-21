import json
import mimetypes
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class DatasetLogger:
    def __init__(self, dataset_dir: str):
        self._base_dir = Path(dataset_dir)
        self._images_dir = self._base_dir / 'images'
        self._crops_dir = self._base_dir / 'crops'
        self._records_dir = self._base_dir / 'records'
        self._lock = threading.Lock()

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    def _guess_extension(self, mime_type: str | None) -> str:
        if not mime_type:
            return '.jpg'
        guessed = mimetypes.guess_extension(mime_type)
        if guessed == '.jpe':
            return '.jpg'
        return guessed or '.jpg'

    def _ensure_dirs(self, day_part: str) -> Path:
        day_dir = self._images_dir / day_part
        day_dir.mkdir(parents=True, exist_ok=True)
        crop_day_dir = self._crops_dir / day_part
        crop_day_dir.mkdir(parents=True, exist_ok=True)
        self._records_dir.mkdir(parents=True, exist_ok=True)
        return day_dir

    def _record_path(self, scan_log_id: str) -> Path:
        return self._records_dir / f'{scan_log_id}.json'

    def _serialize_predictions(self, predictions: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        if not predictions:
            return []
        output: list[dict[str, Any]] = []
        for item in predictions:
            label = str(item.get('label') or item.get('cls') or '').strip()
            confidence_raw = item.get('confidence', item.get('conf', 0.0))
            bbox = item.get('bbox', item.get('xyxy'))
            if not label:
                continue
            try:
                confidence = float(confidence_raw)
            except (TypeError, ValueError):
                confidence = 0.0
            output.append(
                {
                    'cls': label,
                    'conf': max(0.0, min(1.0, confidence)),
                    'xyxy': bbox if isinstance(bbox, list) else None,
                }
            )
        return output

    def _serialize_ocr(self, ocr: list[str] | None) -> list[str]:
        if not ocr:
            return []
        cleaned: list[str] = []
        for token in ocr:
            value = str(token or '').strip()
            if value:
                cleaned.append(value)
        return cleaned

    def _serialize_ocr_entries(self, ocr_entries: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        if not ocr_entries:
            return []
        rows: list[dict[str, Any]] = []
        for row in ocr_entries:
            if not isinstance(row, dict):
                continue
            text = str(row.get('text') or '').strip()
            if not text:
                continue
            conf_raw = row.get('confidence', 0.0)
            try:
                conf = float(conf_raw)
            except (TypeError, ValueError):
                conf = 0.0
            bbox = row.get('bbox')
            rows.append(
                {
                    'text': text,
                    'confidence': max(0.0, min(1.0, conf)),
                    'bbox': bbox if isinstance(bbox, list) else None,
                }
            )
        return rows

    def log_scan(
        self,
        *,
        image_bytes: bytes,
        package_crop_bytes: bytes | None,
        mime_type: str | None,
        predictions: list[dict[str, Any]] | None,
        ocr: list[str] | None,
        ocr_entries: list[dict[str, Any]] | None,
        barcode: str | None,
        predicted_product: str | None,
        predicted_candidates: list[dict[str, Any]] | None,
        context: dict[str, Any] | None,
        request_id: str | None,
        model: str | None,
        latency_ms: int | None,
    ) -> dict[str, Any]:
        scan_log_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        created_at = now.isoformat().replace('+00:00', 'Z')
        day_part = now.date().isoformat()
        ext = self._guess_extension(mime_type)

        with self._lock:
            day_dir = self._ensure_dirs(day_part)
            raw_image_path = day_dir / f'{scan_log_id}{ext}'
            raw_image_path.write_bytes(image_bytes)
            crop_relative_path = None
            if package_crop_bytes:
                crop_dir = self._crops_dir / day_part
                crop_path = crop_dir / f'{scan_log_id}{ext}'
                crop_path.write_bytes(package_crop_bytes)
                crop_relative_path = crop_path.as_posix()

            relative_image_path = raw_image_path.as_posix()
            prediction_rows = self._serialize_predictions(predictions)
            record = {
                'scan_log_id': scan_log_id,
                'image_path': relative_image_path,
                'raw_image_path': relative_image_path,
                'cropped_package_image_path': crop_relative_path,
                'predictions': prediction_rows,
                'detection_boxes': prediction_rows,
                'ocr': self._serialize_ocr(ocr),
                'ocr_output': self._serialize_ocr_entries(ocr_entries),
                'barcode': str(barcode).strip() if barcode else None,
                'barcode_result': str(barcode).strip() if barcode else None,
                'predicted_product': predicted_product,
                'predicted_candidates': predicted_candidates or [],
                'final_predicted_product': predicted_product,
                'user_confirmed': None,
                'user_corrected_to': None,
                'not_food': False,
                'bad_photo': False,
                'feedback_notes': None,
                'created_at': created_at,
                'updated_at': created_at,
                'request_id': request_id,
                'model': model,
                'latency_ms': latency_ms,
                'context': context or {},
            }
            self._record_path(scan_log_id).write_text(
                json.dumps(record, ensure_ascii=True, separators=(',', ':')) + '\n',
                encoding='utf-8',
            )
            return record

    def update_feedback(
        self,
        *,
        scan_log_id: str,
        user_confirmed: bool | None,
        user_corrected_to: str | None,
        not_food: bool | None,
        bad_photo: bool | None,
        feedback_notes: str | None,
    ) -> dict[str, Any]:
        record_path = self._record_path(scan_log_id)
        if not record_path.exists():
            raise FileNotFoundError(scan_log_id)

        with self._lock:
            current_raw = record_path.read_text(encoding='utf-8').strip()
            current = json.loads(current_raw) if current_raw else {}
            if user_confirmed is not None:
                current['user_confirmed'] = bool(user_confirmed)
                if bool(user_confirmed):
                    chosen = current.get('user_corrected_to') or current.get('predicted_product')
                    if chosen:
                        current['user_accepted_product'] = chosen
            if user_corrected_to is not None:
                normalized = user_corrected_to.strip()
                current['user_corrected_to'] = normalized or None
                if normalized:
                    current['user_accepted_product'] = normalized
            if not_food is not None:
                current['not_food'] = bool(not_food)
            if bad_photo is not None:
                current['bad_photo'] = bool(bad_photo)
            if feedback_notes is not None:
                normalized_notes = feedback_notes.strip()
                current['feedback_notes'] = normalized_notes or None

            current['updated_at'] = self._now_iso()
            record_path.write_text(
                json.dumps(current, ensure_ascii=True, separators=(',', ':')) + '\n',
                encoding='utf-8',
            )
            return current
