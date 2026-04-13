import logging
from typing import Any

logger = logging.getLogger(__name__)


class SupabaseScanLogger:
    """Optional Supabase sink for scan logs. No-ops when not configured."""

    def __init__(self, url: str, service_key: str) -> None:
        self._client = None
        if not url or not service_key:
            return
        try:
            from supabase import create_client
            self._client = create_client(url, service_key)
            logger.info('SupabaseScanLogger ready url=%s', url)
        except Exception as exc:
            logger.warning('SupabaseScanLogger init failed — scan logging will be file-only: %s', exc)

    @property
    def available(self) -> bool:
        return self._client is not None

    def insert_scan(self, record: dict[str, Any]) -> None:
        if not self._client:
            return
        try:
            analysis: dict[str, Any] = record.get('analysis') or {}
            row = {
                'scan_log_id': record.get('scan_log_id'),
                'predicted_product': record.get('predicted_product'),
                'packaging_type': analysis.get('packaging_type'),
                'model': record.get('model'),
                'latency_ms': record.get('latency_ms'),
                'created_at': record.get('created_at'),
                'request_id': record.get('request_id'),
                'barcode': record.get('barcode'),
                'ocr_token_count': len(record.get('ocr') or []),
                'top_match_confidence': analysis.get('top_match_confidence'),
                'candidate_count': analysis.get('candidate_count', 0),
                'ocr_strategy': analysis.get('ocr_strategy'),
                'top_match_accepted': analysis.get('top_match_accepted'),
            }
            self._client.table('scan_logs').insert(row).execute()
        except Exception as exc:
            logger.warning('SupabaseScanLogger.insert_scan failed: %s', exc)

    def update_feedback(self, scan_log_id: str, record: dict[str, Any]) -> None:
        if not self._client:
            return
        try:
            row = {
                'user_confirmed': record.get('user_confirmed'),
                'user_corrected_to': record.get('user_corrected_to'),
                'not_food': record.get('not_food'),
                'bad_photo': record.get('bad_photo'),
                'feedback_notes': record.get('feedback_notes'),
                'updated_at': record.get('updated_at'),
                'training_priority': record.get('training_priority'),
                'failure_tags': record.get('failure_tags'),
            }
            self._client.table('scan_logs').update(row).eq('scan_log_id', scan_log_id).execute()
        except Exception as exc:
            logger.warning('SupabaseScanLogger.update_feedback failed: %s', exc)
