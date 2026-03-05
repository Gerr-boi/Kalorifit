import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from src.training.export_dataset import _extract_training_target, _pick_training_bbox, _resolve_image_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Audit logged food scan records before training.')
    parser.add_argument('--dataset-dir', default='dataset', help='Directory containing images/, crops/, and records/.')
    parser.add_argument('--min-per-class', type=int, default=50, help='Warn when a class has fewer than this many examples.')
    parser.add_argument('--include-bad-photos', action='store_true', help='Include scans flagged as bad_photo in audit counts.')
    return parser.parse_args()


def _load_record(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding='utf-8').strip()
    return json.loads(raw) if raw else {}


def main() -> int:
    args = parse_args()
    project_root = Path.cwd()
    dataset_dir = Path(args.dataset_dir).resolve()
    records_dir = dataset_dir / 'records'
    records = sorted(records_dir.glob('*.json')) if records_dir.exists() else []

    classification_counts: Counter[str] = Counter()
    detection_counts: Counter[str] = Counter()
    missing_image = 0
    missing_label = 0
    missing_bbox = 0
    bad_photos = 0
    not_food = 0
    training_ready = 0

    for path in records:
        record = _load_record(path)
        if record.get('bad_photo') is True:
            bad_photos += 1
        target = _extract_training_target(record, include_bad_photos=bool(args.include_bad_photos))
        if not target:
            missing_label += 1
            continue

        label = str(target.get('label') or '').strip()
        if not label:
            missing_label += 1
            continue

        image_path = _resolve_image_path(project_root, dataset_dir, str(record.get('image_path') or ''))
        if image_path is None:
            missing_image += 1
            continue

        training_ready += 1
        classification_counts[label] += 1
        if label == '__non_food__':
            not_food += 1

        bbox = _pick_training_bbox(record)
        if bbox is None:
            missing_bbox += 1
            continue
        detection_counts[label] += 1

    underrepresented = sorted(
        [{'label': label, 'count': count} for label, count in classification_counts.items() if count < int(args.min_per_class)],
        key=lambda row: (row['count'], row['label']),
    )
    summary = {
        'dataset_dir': dataset_dir.as_posix(),
        'records': len(records),
        'training_ready': training_ready,
        'bad_photos': bad_photos,
        'not_food': not_food,
        'missing_image': missing_image,
        'missing_label': missing_label,
        'missing_bbox_for_detection': missing_bbox,
        'classification_counts': dict(sorted(classification_counts.items())),
        'detection_counts': dict(sorted(detection_counts.items())),
        'underrepresented_labels': underrepresented,
        'min_per_class': int(args.min_per_class),
    }
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
