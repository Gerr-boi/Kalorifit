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

    def _as_float(self, value: Any) -> float | None:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        return numeric

    def _as_int(self, value: Any) -> int | None:
        try:
            numeric = int(value)
        except (TypeError, ValueError):
            return None
        return numeric

    def _as_bool(self, value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        return None

    def _as_str(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _as_str_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        output: list[str] = []
        for item in value:
            text = self._as_str(item)
            if text:
                output.append(text)
        return output

    def _as_float_dict(self, value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        output: dict[str, float] = {}
        for key, raw in value.items():
            name = self._as_str(key)
            numeric = self._as_float(raw)
            if name and numeric is not None:
                output[name] = max(0.0, min(1.0, numeric))
        return output

    def _serialize_analysis(self, analysis: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(analysis, dict):
            return {}
        return {
            'packaging_type': self._as_str(analysis.get('packaging_type')),
            'ocr_strategy': self._as_str(analysis.get('ocr_strategy')),
            'top_match_confidence': self._as_float(analysis.get('top_match_confidence')),
            'top_match_margin': self._as_float(analysis.get('top_match_margin')),
            'top_match_accepted': self._as_bool(analysis.get('top_match_accepted')),
            'package_detection_strategy': self._as_str(analysis.get('package_detection_strategy')),
            'detected_labels': self._as_str_list(analysis.get('detected_labels')),
            'packaging_scores': self._as_float_dict(analysis.get('packaging_scores')),
            'structured_ocr_fields': analysis.get('structured_ocr_fields') if isinstance(analysis.get('structured_ocr_fields'), dict) else {},
            'candidate_count': self._as_int(analysis.get('candidate_count')) or 0,
            'detection_count': self._as_int(analysis.get('detection_count')) or 0,
            'text_detection_count': self._as_int(analysis.get('text_detection_count')) or 0,
            'non_food_filtered_count': self._as_int(analysis.get('non_food_filtered_count')) or 0,
        }

    def _normalize_context(self, context: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(context, dict):
            return {}
        return {
            'scan_mode': self._as_str(context.get('scan_mode')),
            'device_info': self._as_str(context.get('device_info')),
            'rotation_degrees': self._as_int(context.get('rotation_degrees')),
        }

    def _derive_domain_key(self, current: dict[str, Any]) -> str:
        context = current.get('context') if isinstance(current.get('context'), dict) else {}
        scan_mode = self._as_str(context.get('scan_mode')) or 'unknown'
        device_info = self._as_str(context.get('device_info')) or 'unknown'
        parts = [part.strip().lower() for part in device_info.split('|') if part.strip()]
        platform = parts[0] if parts else 'unknown'
        agent = parts[1] if len(parts) > 1 else ''
        browser = 'unknown'
        if 'iphone' in agent or 'ios' in agent:
            platform = 'ios'
        elif 'android' in agent:
            platform = 'android'
        elif 'win' in platform:
            platform = 'windows'
        elif 'mac' in platform:
            platform = 'mac'

        if 'chrome' in agent or 'crios' in agent:
            browser = 'chrome'
        elif 'safari' in agent:
            browser = 'safari'
        elif 'firefox' in agent:
            browser = 'firefox'
        elif 'edg' in agent:
            browser = 'edge'
        return f'{scan_mode}:{platform}:{browser}'

    def _normalize_feedback_context(self, feedback_context: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(feedback_context, dict):
            return {}
        return {
            'imageHash': self._as_str(feedback_context.get('imageHash')),
            'scanSessionId': self._as_str(feedback_context.get('scanSessionId')),
            'resolverChosenItemId': self._as_str(feedback_context.get('resolverChosenItemId')),
            'resolverChosenScore': self._as_float(feedback_context.get('resolverChosenScore')),
            'resolverChosenConfidence': self._as_float(feedback_context.get('resolverChosenConfidence')),
            'userFinalItemId': self._as_str(feedback_context.get('userFinalItemId')),
            'seedWinSource': self._as_str(feedback_context.get('seedWinSource')),
            'timeToFirstCandidateMs': self._as_float(feedback_context.get('timeToFirstCandidateMs')),
            'predictLatencyMs': self._as_float(feedback_context.get('predictLatencyMs')),
            'resolveLatencyMs': self._as_float(feedback_context.get('resolveLatencyMs')),
            'ocrTextCharCount': self._as_float(feedback_context.get('ocrTextCharCount')),
            'ocrBestLineScore': self._as_float(feedback_context.get('ocrBestLineScore')),
            'ocrSeedCount': self._as_float(feedback_context.get('ocrSeedCount')),
            'ocrRunCount': self._as_float(feedback_context.get('ocrRunCount')),
            'ocrBrandBoostUsed': self._as_bool(feedback_context.get('ocrBrandBoostUsed')),
            'frontVisibilityScore': self._as_float(feedback_context.get('frontVisibilityScore')),
            'selectedFrameQuality': self._as_float(feedback_context.get('selectedFrameQuality')),
            'selectedFrameSharpness': self._as_float(feedback_context.get('selectedFrameSharpness')),
            'selectedFrameGlare': self._as_float(feedback_context.get('selectedFrameGlare')),
            'selectedFrameBrightness': self._as_float(feedback_context.get('selectedFrameBrightness')),
            'packagingType': self._as_str(feedback_context.get('packagingType')),
            'topMatchConfidence': self._as_float(feedback_context.get('topMatchConfidence')),
            'topMatchMargin': self._as_float(feedback_context.get('topMatchMargin')),
            'ocrStrategy': self._as_str(feedback_context.get('ocrStrategy')),
            'shouldPromptRetake': self._as_bool(feedback_context.get('shouldPromptRetake')),
            'hadCorrectionTap': self._as_bool(feedback_context.get('hadCorrectionTap')),
            'adaptiveRankingApplied': self._as_bool(feedback_context.get('adaptiveRankingApplied')),
        }

    def _derive_data_quality(self, current: dict[str, Any], feedback_context: dict[str, Any]) -> dict[str, Any]:
        analysis = current.get('analysis') if isinstance(current.get('analysis'), dict) else {}
        packaging_type = self._as_str(feedback_context.get('packagingType')) or self._as_str(analysis.get('packaging_type'))
        frame_sharpness = self._as_float(feedback_context.get('selectedFrameSharpness'))
        frame_glare = self._as_float(feedback_context.get('selectedFrameGlare'))
        frame_brightness = self._as_float(feedback_context.get('selectedFrameBrightness'))
        frame_quality = self._as_float(feedback_context.get('selectedFrameQuality'))
        front_visibility = self._as_float(feedback_context.get('frontVisibilityScore'))
        ocr_chars = self._as_float(feedback_context.get('ocrTextCharCount'))
        ocr_score = self._as_float(feedback_context.get('ocrBestLineScore'))
        top_match_margin = self._as_float(feedback_context.get('topMatchMargin')) or self._as_float(analysis.get('top_match_margin'))

        packaged = packaging_type in {'can', 'bottle', 'carton', 'wrapper', 'pouch'}
        flags = {
            'blur': frame_sharpness is not None and frame_sharpness < 0.28,
            'glare': frame_glare is not None and frame_glare > 0.62,
            'low_light': frame_brightness is not None and frame_brightness < 0.3,
            'low_label_visibility': packaged and front_visibility is not None and front_visibility < 0.46,
            'weak_ocr': (ocr_chars is not None and ocr_chars < 8) or (ocr_score is not None and ocr_score < 0.55),
            'ambiguous_match': top_match_margin is not None and top_match_margin < 0.08,
        }
        issue_count = sum(1 for value in flags.values() if value)
        quality_bucket = 'high'
        if issue_count >= 3 or current.get('bad_photo') is True:
            quality_bucket = 'low'
        elif issue_count >= 1:
            quality_bucket = 'medium'

        return {
            'packaging_type': packaging_type,
            'frame_quality': frame_quality,
            'frame_sharpness': frame_sharpness,
            'frame_glare': frame_glare,
            'frame_brightness': frame_brightness,
            'front_visibility_score': front_visibility,
            'ocr_text_char_count': ocr_chars,
            'ocr_best_line_score': ocr_score,
            'top_match_margin': top_match_margin,
            'condition_flags': flags,
            'quality_bucket': quality_bucket,
        }

    def _derive_failure_tags(self, current: dict[str, Any]) -> list[str]:
        tags: set[str] = set()
        feedback_context = current.get('feedback_context') if isinstance(current.get('feedback_context'), dict) else {}
        data_quality = current.get('data_quality') if isinstance(current.get('data_quality'), dict) else {}
        flags = data_quality.get('condition_flags') if isinstance(data_quality.get('condition_flags'), dict) else {}
        ocr_rows = current.get('ocr_output') if isinstance(current.get('ocr_output'), list) else []
        ocr_blob = ' '.join(
            str(row.get('text') or '').strip().lower()
            for row in ocr_rows
            if isinstance(row, dict)
        )

        predicted_product = self._as_str(current.get('predicted_product'))
        corrected_to = self._as_str(current.get('user_corrected_to'))
        if current.get('not_food') is True:
            tags.add('hard_negative_non_food')
        if current.get('bad_photo') is True:
            tags.add('bad_photo')
        if predicted_product and corrected_to and predicted_product.lower() != corrected_to.lower():
            tags.add('wrong_product_match')
        if current.get('user_confirmed') is False and not corrected_to and current.get('not_food') is not True:
            tags.add('unresolved_prediction')
        if feedback_context.get('shouldPromptRetake') is True:
            tags.add('quality_gate_triggered')
        if flags.get('blur'):
            tags.add('motion_or_focus_blur')
        if flags.get('glare'):
            tags.add('specular_glare')
        if flags.get('low_light'):
            tags.add('low_light')
        if flags.get('low_label_visibility'):
            tags.add('low_label_visibility')
        if flags.get('weak_ocr'):
            tags.add('weak_ocr')
        if flags.get('ambiguous_match'):
            tags.add('close_tie')
        if int(current.get('analysis', {}).get('non_food_filtered_count') or 0) > 0:
            tags.add('non_food_confuser_seen')
        if any(token in ocr_blob for token in (' kr', 'nok', 'tilbud', 'save', '%', '2 for', '3 for')):
            tags.add('shelf_tag_noise')
        return sorted(tags)

    def _derive_active_learning(self, current: dict[str, Any]) -> dict[str, Any]:
        analysis = current.get('analysis') if isinstance(current.get('analysis'), dict) else {}
        data_quality = current.get('data_quality') if isinstance(current.get('data_quality'), dict) else {}
        failure_tags = current.get('failure_tags') if isinstance(current.get('failure_tags'), list) else []
        reasons: list[str] = []
        score = 0

        top_conf = self._as_float(analysis.get('top_match_confidence'))
        top_margin = self._as_float(analysis.get('top_match_margin'))
        predicted_product = self._as_str(current.get('predicted_product'))
        quality_bucket = self._as_str(data_quality.get('quality_bucket'))

        if top_conf is None or top_conf < 0.72:
            reasons.append('low_confidence')
            score += 3
        if top_margin is None or top_margin < 0.1:
            reasons.append('candidate_disagreement')
            score += 3
        if not predicted_product:
            reasons.append('open_set_or_unknown')
            score += 2
        if current.get('user_confirmed') is False or current.get('user_corrected_to') or current.get('not_food') is True:
            reasons.append('user_disagreed')
            score += 4
        if quality_bucket == 'low':
            reasons.append('poor_capture_quality')
            score += 2
        if 'hard_negative_non_food' in failure_tags:
            reasons.append('hard_negative_non_food')
            score += 5
        if 'wrong_product_match' in failure_tags:
            reasons.append('wrong_product_match')
            score += 5
        if 'shelf_tag_noise' in failure_tags:
            reasons.append('ignore_region_noise')
            score += 2

        deduped_reasons = list(dict.fromkeys(reasons))
        return {
            'candidate': bool(deduped_reasons),
            'score': score,
            'reasons': deduped_reasons,
            'domain_key': self._derive_domain_key(current),
        }

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
        analysis: dict[str, Any] | None,
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
                'analysis': self._serialize_analysis(analysis),
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
                'context': self._normalize_context(context),
            }
            record['active_learning'] = self._derive_active_learning(record)
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
        feedback_context: dict[str, Any] | None,
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
            if feedback_context is not None:
                current['feedback_context'] = self._normalize_feedback_context(feedback_context)

            current['data_quality'] = self._derive_data_quality(
                current,
                current.get('feedback_context') if isinstance(current.get('feedback_context'), dict) else {},
            )
            current['failure_tags'] = self._derive_failure_tags(current)
            current['training_priority'] = (
                'high'
                if any(tag in current['failure_tags'] for tag in ('hard_negative_non_food', 'wrong_product_match'))
                else ('medium' if current['failure_tags'] else 'low')
            )
            current['active_learning'] = self._derive_active_learning(current)

            current['updated_at'] = self._now_iso()
            record_path.write_text(
                json.dumps(current, ensure_ascii=True, separators=(',', ':')) + '\n',
                encoding='utf-8',
            )
            return current
