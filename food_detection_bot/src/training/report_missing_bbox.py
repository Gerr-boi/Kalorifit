import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from src.training.export_dataset import _extract_training_target, _pick_training_bbox


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='List human-labeled records that are still missing a bbox for detection.')
    parser.add_argument('--dataset-dir', default='dataset', help='Directory containing images/, crops/, and records/.')
    parser.add_argument('--limit', type=int, default=200, help='Max record ids to print per class.')
    parser.add_argument('--only-label', default=None, help='Only report one normalized label, for example banana.')
    parser.add_argument('--include-bad-photos', action='store_true', help='Include scans flagged as bad_photo.')
    return parser.parse_args()


def _load_record(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding='utf-8').strip()
    return json.loads(raw) if raw else {}


def collect_missing_bbox_records(
    dataset_dir: Path,
    limit: int,
    include_bad_photos: bool,
    only_label: str | None = None,
) -> dict[str, Any]:
    records_dir = dataset_dir / 'records'
    if not records_dir.exists():
        raise SystemExit(f'Missing records dir: {records_dir.as_posix()}')

    missing_by_label: dict[str, list[str]] = defaultdict(list)
    total = 0
    labeled = 0
    normalized_only_label = str(only_label or '').strip()

    for path in sorted(records_dir.glob('*.json')):
        total += 1
        record = _load_record(path)
        target = _extract_training_target(record, include_bad_photos=include_bad_photos)
        if not target:
            continue

        label = str(target.get('label') or '').strip()
        if not label:
            continue
        if normalized_only_label and label != normalized_only_label:
            continue
        labeled += 1

        if _pick_training_bbox(record) is not None:
            continue

        record_id = str(record.get('scan_log_id') or record.get('id') or path.stem)
        missing_by_label[label].append(record_id)

    grouped = [
        {
            'label': label,
            'count': len(ids),
            'example_ids': ids[: max(0, int(limit))],
        }
        for label, ids in sorted(missing_by_label.items(), key=lambda row: (len(row[1]), row[0]))
    ]
    return {
        'dataset_dir': dataset_dir.as_posix(),
        'total_records': total,
        'human_labeled_records': labeled,
        'only_label': normalized_only_label or None,
        'classes_missing_bbox': grouped,
    }


def main() -> int:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir).resolve()
    summary = collect_missing_bbox_records(
        dataset_dir=dataset_dir,
        limit=int(args.limit),
        include_bad_photos=bool(args.include_bad_photos),
        only_label=args.only_label,
    )
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
