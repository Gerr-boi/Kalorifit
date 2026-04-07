import argparse
import json
from pathlib import Path

from src.training.report_missing_bbox import collect_missing_bbox_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate a bbox-fix template JSON for labeled records missing boxes.')
    parser.add_argument('--dataset-dir', default='dataset', help='Directory containing images/, crops/, and records/.')
    parser.add_argument('--output', default='fixes.template.json', help='Path to write the generated template JSON.')
    parser.add_argument('--only-label', default=None, help='Only include one normalized label, for example banana.')
    parser.add_argument('--include-bad-photos', action='store_true', help='Include scans flagged as bad_photo.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir).resolve()
    output_path = Path(args.output).resolve()
    summary = collect_missing_bbox_records(
        dataset_dir=dataset_dir,
        limit=1_000_000,
        include_bad_photos=bool(args.include_bad_photos),
        only_label=args.only_label,
    )

    template: dict[str, None] = {}
    for group in summary.get('classes_missing_bbox', []):
        if not isinstance(group, dict):
            continue
        example_ids = group.get('example_ids')
        if not isinstance(example_ids, list):
            continue
        for scan_log_id in example_ids:
            key = str(scan_log_id).strip()
            if key:
                template[key] = None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(template, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')

    print(
        json.dumps(
            {
                'dataset_dir': dataset_dir.as_posix(),
                'output': output_path.as_posix(),
                'records': len(template),
                'only_label': str(args.only_label).strip() or None,
            },
            ensure_ascii=True,
            indent=2,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
