import argparse
import json
from pathlib import Path
from typing import Any

from src.data_logger import DatasetLogger
from src.training.export_dataset import _extract_training_target


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Patch corrected bounding boxes into labeled scan records.')
    parser.add_argument('--dataset-dir', default='dataset', help='Directory containing images/, crops/, and records/.')
    parser.add_argument('--input', required=True, help='JSON file mapping scan ids to bbox arrays or {label,bbox} objects.')
    parser.add_argument('--include-bad-photos', action='store_true', help='Allow updating records flagged as bad_photo.')
    return parser.parse_args()


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def _coerce_patch(value: Any) -> tuple[str | None, list[float] | None]:
    if isinstance(value, list) and len(value) == 4:
        try:
            return None, [float(x) for x in value]
        except (TypeError, ValueError):
            return None, None
    if isinstance(value, dict):
        label = str(value.get('label')).strip() if value.get('label') is not None else None
        bbox = value.get('bbox')
        if isinstance(bbox, list) and len(bbox) == 4:
            try:
                return label, [float(x) for x in bbox]
            except (TypeError, ValueError):
                return label, None
    return None, None


def main() -> int:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir).resolve()
    records_dir = dataset_dir / 'records'
    if not records_dir.exists():
        raise SystemExit(f'Missing records dir: {records_dir.as_posix()}')

    fixes = _load_json(Path(args.input).resolve())
    if not isinstance(fixes, dict):
        raise SystemExit('Input file must be a JSON object keyed by scan_log_id.')

    logger = DatasetLogger(str(dataset_dir))
    updated = 0
    skipped: list[dict[str, str]] = []

    for scan_log_id, patch in fixes.items():
        record_path = records_dir / f'{scan_log_id}.json'
        if not record_path.exists():
            skipped.append({'scan_log_id': str(scan_log_id), 'reason': 'record_not_found'})
            continue
        record = _load_json(record_path)
        target = _extract_training_target(record, include_bad_photos=bool(args.include_bad_photos))
        if not target:
            skipped.append({'scan_log_id': str(scan_log_id), 'reason': 'record_not_human_labeled'})
            continue

        patch_label, bbox = _coerce_patch(patch)
        if bbox is None:
            skipped.append({'scan_log_id': str(scan_log_id), 'reason': 'invalid_bbox'})
            continue

        label = patch_label or str(target.get('label') or '').strip()
        if not label:
            skipped.append({'scan_log_id': str(scan_log_id), 'reason': 'missing_label'})
            continue

        logger.update_feedback(
            scan_log_id=str(scan_log_id),
            user_confirmed=None,
            user_corrected_to=None,
            not_food=None,
            bad_photo=None,
            feedback_notes=None,
            corrected_detection={'label': label, 'bbox': bbox},
            feedback_context=None,
        )
        updated += 1

    print(
        json.dumps(
            {
                'dataset_dir': dataset_dir.as_posix(),
                'updated': updated,
                'skipped': skipped,
            },
            ensure_ascii=True,
            indent=2,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
