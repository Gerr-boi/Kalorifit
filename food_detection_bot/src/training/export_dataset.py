import argparse
import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image
from src.training.labels import normalize_training_label


@dataclass
class ExportSample:
    scan_log_id: str
    label: str
    split: str
    image_path: Path
    bbox: list[float] | None
    product_id: str | None
    label_source: str | None


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _slugify(value: str) -> str:
    text = ''.join(ch.lower() if ch.isalnum() else '-' for ch in value.strip())
    while '--' in text:
        text = text.replace('--', '-')
    return text.strip('-') or 'unknown'


def _choose_split(scan_log_id: str, val_ratio: float) -> str:
    digest = hashlib.sha256(scan_log_id.encode('utf-8')).hexdigest()
    bucket = int(digest[:8], 16) / 0xFFFFFFFF
    return 'val' if bucket < val_ratio else 'train'


def _load_record(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding='utf-8').strip()
    return json.loads(raw) if raw else {}


def _resolve_image_path(project_root: Path, dataset_dir: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    candidate = Path(raw_path)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    for base in (project_root, dataset_dir.parent, dataset_dir):
        resolved = (base / candidate).resolve()
        if resolved.exists():
            return resolved
    return None


def _valid_bbox(raw_bbox: Any) -> list[float] | None:
    if not isinstance(raw_bbox, list) or len(raw_bbox) != 4:
        return None
    coords = [_safe_float(value) for value in raw_bbox]
    if any(value is None for value in coords):
        return None
    x1, y1, x2, y2 = [float(value) for value in coords]
    if x2 <= x1 or y2 <= y1:
        return None
    return [x1, y1, x2, y2]


def _pick_training_bbox(record: dict[str, Any]) -> list[float] | None:
    target = record.get('training_target') if isinstance(record.get('training_target'), dict) else {}
    target_bbox = _valid_bbox(target.get('bbox'))
    if target_bbox is not None:
        return target_bbox

    corrected_detection = record.get('corrected_detection') if isinstance(record.get('corrected_detection'), dict) else {}
    corrected_bbox = _valid_bbox(corrected_detection.get('bbox'))
    if corrected_bbox is not None:
        return corrected_bbox

    rows = record.get('detection_boxes') if isinstance(record.get('detection_boxes'), list) else record.get('predictions')
    if not isinstance(rows, list):
        return None

    best_bbox: list[float] | None = None
    best_score = float('-inf')
    for row in rows:
        if not isinstance(row, dict):
            continue
        bbox = _valid_bbox(row.get('xyxy') if row.get('xyxy') is not None else row.get('bbox'))
        if bbox is None:
            continue
        conf = _safe_float(row.get('conf') if row.get('conf') is not None else row.get('confidence')) or 0.0
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        score = conf * 10_000_000 + area
        if score > best_score:
            best_score = score
            best_bbox = bbox
    return best_bbox


def _extract_training_target(record: dict[str, Any], include_bad_photos: bool) -> dict[str, Any] | None:
    if not include_bad_photos and record.get('bad_photo') is True:
        return None
    target = record.get('training_target')
    if isinstance(target, dict):
        normalized = normalize_training_label(target.get('label'))
        if not normalized:
            return None
        return {
            **target,
            'label': normalized,
        }

    if record.get('not_food') is True:
        return {
            'task': 'detection',
            'label': '__non_food__',
            'label_source': 'legacy_not_food',
            'product_id': None,
            'bbox': None,
        }

    corrected_to = str(record.get('user_corrected_to') or '').strip()
    if corrected_to:
        normalized = normalize_training_label(corrected_to)
        if not normalized:
            return None
        return {
            'task': 'detection',
            'label': normalized,
            'label_source': 'legacy_user_corrected',
            'product_id': None,
            'bbox': None,
        }

    if record.get('user_confirmed') is True:
        accepted = str(record.get('user_accepted_product') or record.get('predicted_product') or '').strip()
        if accepted:
            normalized = normalize_training_label(accepted)
            if not normalized:
                return None
            return {
                'task': 'detection',
                'label': normalized,
                'label_source': 'legacy_user_confirmed_prediction',
                'product_id': None,
                'bbox': None,
            }
    return None


def collect_samples(dataset_dir: Path, project_root: Path, include_bad_photos: bool, val_ratio: float) -> list[ExportSample]:
    records_dir = dataset_dir / 'records'
    samples: list[ExportSample] = []
    if not records_dir.exists():
        return samples

    for record_path in sorted(records_dir.glob('*.json')):
        record = _load_record(record_path)
        target = _extract_training_target(record, include_bad_photos=include_bad_photos)
        if not target:
            continue

        label = str(target.get('label') or '').strip()
        if not label:
            continue

        image_path = _resolve_image_path(project_root, dataset_dir, str(record.get('image_path') or ''))
        if image_path is None:
            continue

        scan_log_id = str(record.get('scan_log_id') or record_path.stem)
        samples.append(
            ExportSample(
                scan_log_id=scan_log_id,
                label=label,
                split=_choose_split(scan_log_id, val_ratio),
                image_path=image_path,
                bbox=_pick_training_bbox(record),
                product_id=str(target.get('product_id')) if target.get('product_id') else None,
                label_source=str(target.get('label_source')) if target.get('label_source') else None,
            )
        )
    return samples


def _copy_image(sample: ExportSample, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sample.image_path, destination)


def _to_yolo_bbox(bbox: list[float], width: int, height: int) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox
    cx = ((x1 + x2) / 2.0) / width
    cy = ((y1 + y2) / 2.0) / height
    bw = (x2 - x1) / width
    bh = (y2 - y1) / height
    return cx, cy, bw, bh


def export_yolo_dataset(output_dir: Path, samples: list[ExportSample]) -> dict[str, Any]:
    yolo_dir = output_dir / 'yolo'
    labeled_samples = [sample for sample in samples if sample.bbox is not None]
    class_names = sorted({sample.label for sample in labeled_samples})
    class_to_index = {name: index for index, name in enumerate(class_names)}

    for sample in labeled_samples:
        split = sample.split
        image_dest = yolo_dir / 'images' / split / f'{sample.scan_log_id}{sample.image_path.suffix.lower() or ".jpg"}'
        label_dest = yolo_dir / 'labels' / split / f'{sample.scan_log_id}.txt'
        _copy_image(sample, image_dest)
        with Image.open(sample.image_path) as img:
            width, height = img.size
        cx, cy, bw, bh = _to_yolo_bbox(sample.bbox or [0, 0, 0, 0], width, height)
        label_dest.parent.mkdir(parents=True, exist_ok=True)
        label_dest.write_text(
            f'{class_to_index[sample.label]} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n',
            encoding='utf-8',
        )

    data_yaml = yolo_dir / 'data.yaml'
    names_block = '\n'.join(f'  {index}: "{name}"' for index, name in enumerate(class_names))
    data_yaml.write_text(
        '\n'.join(
            [
                f'path: {yolo_dir.as_posix()}',
                'train: images/train',
                'val: images/val',
                f'nc: {len(class_names)}',
                'names:',
                names_block if names_block else '  {}',
                '',
            ]
        ),
        encoding='utf-8',
    )

    return {
        'task': 'yolo_detection',
        'export_dir': yolo_dir.as_posix(),
        'class_names': class_names,
        'images': len(labeled_samples),
        'train_images': sum(1 for sample in labeled_samples if sample.split == 'train'),
        'val_images': sum(1 for sample in labeled_samples if sample.split == 'val'),
    }


def export_classification_dataset(output_dir: Path, samples: list[ExportSample]) -> dict[str, Any]:
    classification_dir = output_dir / 'classification'
    manifest_path = classification_dir / 'manifest.jsonl'
    manifest_rows: list[str] = []

    for sample in samples:
        split = sample.split
        class_slug = _slugify(sample.label)
        image_dest = classification_dir / split / class_slug / f'{sample.scan_log_id}{sample.image_path.suffix.lower() or ".jpg"}'
        _copy_image(sample, image_dest)
        manifest_rows.append(
            json.dumps(
                {
                    'scan_log_id': sample.scan_log_id,
                    'split': split,
                    'label': sample.label,
                    'product_id': sample.product_id,
                    'label_source': sample.label_source,
                    'image_path': image_dest.as_posix(),
                },
                ensure_ascii=True,
                separators=(',', ':'),
            )
        )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text('\n'.join(manifest_rows) + ('\n' if manifest_rows else ''), encoding='utf-8')
    return {
        'task': 'classification',
        'export_dir': classification_dir.as_posix(),
        'images': len(samples),
        'train_images': sum(1 for sample in samples if sample.split == 'train'),
        'val_images': sum(1 for sample in samples if sample.split == 'val'),
        'labels': sorted({sample.label for sample in samples}),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Export logged food scan feedback into trainable datasets.')
    parser.add_argument('--dataset-dir', default='dataset', help='Directory containing images/, crops/, and records/.')
    parser.add_argument('--output-dir', default='training_exports/latest', help='Output directory for exported datasets.')
    parser.add_argument(
        '--tasks',
        default='yolo,classification',
        help='Comma-separated export tasks. Supported: yolo, classification.',
    )
    parser.add_argument('--val-ratio', type=float, default=0.2, help='Validation split ratio between 0.0 and 0.9.')
    parser.add_argument('--include-bad-photos', action='store_true', help='Include scans flagged as bad_photo.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = Path.cwd()
    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    tasks = {token.strip().lower() for token in str(args.tasks).split(',') if token.strip()}
    if not tasks:
        raise SystemExit('No export tasks specified.')
    if args.val_ratio < 0.0 or args.val_ratio >= 1.0:
        raise SystemExit('--val-ratio must be between 0.0 and 1.0.')

    samples = collect_samples(
        dataset_dir=dataset_dir,
        project_root=project_root,
        include_bad_photos=bool(args.include_bad_photos),
        val_ratio=float(args.val_ratio),
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        'dataset_dir': dataset_dir.as_posix(),
        'output_dir': output_dir.as_posix(),
        'samples_considered': len(samples),
        'tasks': {},
    }
    if 'yolo' in tasks:
        summary['tasks']['yolo'] = export_yolo_dataset(output_dir, samples)
    if 'classification' in tasks:
        summary['tasks']['classification'] = export_classification_dataset(output_dir, samples)

    (output_dir / 'summary.json').write_text(
        json.dumps(summary, ensure_ascii=True, indent=2) + '\n',
        encoding='utf-8',
    )
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
