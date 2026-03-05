import json
from pathlib import Path

from PIL import Image

from src.data_logger import DatasetLogger
from src.training.labels import normalize_training_label
from src.training.make_fixes_template import main as make_fixes_template_main
from src.training.report_missing_bbox import collect_missing_bbox_records
from src.training.export_dataset import collect_samples, export_classification_dataset, export_yolo_dataset


def _write_image(path: Path, size: tuple[int, int] = (100, 80)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', size, color='white').save(path, format='JPEG')


def test_feedback_persists_training_target_for_confirmed_prediction(isolated_dataset_dir: Path):
    logger = DatasetLogger(str(isolated_dataset_dir))
    image_bytes = b'fake-image'
    record = logger.log_scan(
        image_bytes=image_bytes,
        package_crop_bytes=None,
        mime_type='image/jpeg',
        predictions=[{'label': 'package', 'confidence': 0.8, 'bbox': [10, 10, 90, 70]}],
        ocr=[],
        ocr_entries=[],
        barcode=None,
        predicted_product='banana',
        predicted_candidates=[{'name': 'banana', 'product_id': 'banana-1'}],
        analysis=None,
        context=None,
        request_id='req-1',
        model='dummy-v1',
        latency_ms=1,
    )

    logger.update_feedback(
        scan_log_id=record['scan_log_id'],
        user_confirmed=True,
        user_corrected_to=None,
        not_food=False,
        bad_photo=False,
        feedback_notes=None,
        feedback_context={'resolverChosenItemId': 'banana-1'},
    )

    saved = json.loads((isolated_dataset_dir / 'records' / f"{record['scan_log_id']}.json").read_text(encoding='utf-8'))
    assert saved['training_target'] == {
        'task': 'detection',
        'label': 'banana',
        'label_source': 'user_confirmed_prediction',
        'product_id': 'banana-1',
        'bbox': None,
    }


def test_feedback_persists_corrected_bbox_into_training_target(isolated_dataset_dir: Path):
    logger = DatasetLogger(str(isolated_dataset_dir))
    record = logger.log_scan(
        image_bytes=b'fake-image',
        package_crop_bytes=None,
        mime_type='image/jpeg',
        predictions=[{'label': 'package', 'confidence': 0.8, 'bbox': [10, 10, 90, 70]}],
        ocr=[],
        ocr_entries=[],
        barcode=None,
        predicted_product='banana',
        predicted_candidates=[{'name': 'banana', 'product_id': 'banana-1'}],
        analysis=None,
        context=None,
        request_id='req-2',
        model='dummy-v1',
        latency_ms=1,
    )

    logger.update_feedback(
        scan_log_id=record['scan_log_id'],
        user_confirmed=False,
        user_corrected_to='apple',
        not_food=False,
        bad_photo=False,
        feedback_notes=None,
        corrected_detection={'label': 'apple', 'bbox': [12, 14, 88, 68]},
        feedback_context=None,
    )

    saved = json.loads((isolated_dataset_dir / 'records' / f"{record['scan_log_id']}.json").read_text(encoding='utf-8'))
    assert saved['corrected_detection'] == {'label': 'apple', 'bbox': [12.0, 14.0, 88.0, 68.0]}
    assert saved['training_target']['bbox'] == [12.0, 14.0, 88.0, 68.0]


def test_collect_samples_uses_feedback_labels_and_skips_bad_photos(tmp_path: Path):
    dataset_dir = tmp_path / 'dataset'
    image_path = tmp_path / 'dataset' / 'images' / '2026-03-01' / 'scan-1.jpg'
    _write_image(image_path)
    records_dir = dataset_dir / 'records'
    records_dir.mkdir(parents=True, exist_ok=True)
    (records_dir / 'scan-1.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-1',
                'image_path': image_path.as_posix(),
                'bad_photo': False,
                'detection_boxes': [{'cls': 'package', 'conf': 0.9, 'xyxy': [10, 10, 90, 70]}],
                'training_target': {'task': 'detection', 'label': 'apple', 'label_source': 'user_corrected', 'product_id': 'apple-1', 'bbox': None},
            }
        ),
        encoding='utf-8',
    )
    (records_dir / 'scan-2.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-2',
                'image_path': image_path.as_posix(),
                'bad_photo': True,
                'detection_boxes': [{'cls': 'package', 'conf': 0.9, 'xyxy': [10, 10, 90, 70]}],
                'training_target': {'task': 'detection', 'label': 'orange', 'label_source': 'user_corrected', 'product_id': 'orange-1', 'bbox': None},
            }
        ),
        encoding='utf-8',
    )

    samples = collect_samples(dataset_dir=dataset_dir, project_root=tmp_path, include_bad_photos=False, val_ratio=0.2)

    assert len(samples) == 1
    assert samples[0].label == 'apple'
    assert samples[0].bbox == [10.0, 10.0, 90.0, 70.0]


def test_collect_samples_supports_legacy_feedback_fields(tmp_path: Path):
    dataset_dir = tmp_path / 'dataset'
    image_path = tmp_path / 'dataset' / 'images' / '2026-03-01' / 'scan-legacy.jpg'
    _write_image(image_path)
    records_dir = dataset_dir / 'records'
    records_dir.mkdir(parents=True, exist_ok=True)
    (records_dir / 'scan-legacy.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-legacy',
                'image_path': image_path.as_posix(),
                'bad_photo': False,
                'user_confirmed': True,
                'predicted_product': 'orange',
                'detection_boxes': [{'cls': 'package', 'conf': 0.7, 'xyxy': [5, 5, 95, 75]}],
            }
        ),
        encoding='utf-8',
    )

    samples = collect_samples(dataset_dir=dataset_dir, project_root=tmp_path, include_bad_photos=False, val_ratio=0.2)

    assert len(samples) == 1
    assert samples[0].label == 'orange'
    assert samples[0].bbox == [5.0, 5.0, 95.0, 75.0]


def test_exporters_write_yolo_and_classification_outputs(tmp_path: Path):
    image_path = tmp_path / 'dataset' / 'images' / '2026-03-01' / 'scan-1.jpg'
    _write_image(image_path, size=(100, 80))
    samples = [
        type('Sample', (), {
            'scan_log_id': 'scan-1',
            'label': 'apple',
            'split': 'train',
            'image_path': image_path,
            'bbox': [10.0, 20.0, 70.0, 60.0],
            'product_id': 'apple-1',
            'label_source': 'user_corrected',
        })(),
        type('Sample', (), {
            'scan_log_id': 'scan-2',
            'label': 'banana split',
            'split': 'val',
            'image_path': image_path,
            'bbox': None,
            'product_id': 'banana-split-1',
            'label_source': 'user_confirmed_prediction',
        })(),
    ]

    yolo_summary = export_yolo_dataset(tmp_path / 'exports', samples)
    classification_summary = export_classification_dataset(tmp_path / 'exports', samples)

    yolo_label = (tmp_path / 'exports' / 'yolo' / 'labels' / 'train' / 'scan-1.txt').read_text(encoding='utf-8').strip()
    manifest_lines = (tmp_path / 'exports' / 'classification' / 'manifest.jsonl').read_text(encoding='utf-8').splitlines()
    data_yaml = (tmp_path / 'exports' / 'yolo' / 'data.yaml').read_text(encoding='utf-8')

    assert yolo_summary['images'] == 1
    assert yolo_label == '0 0.400000 0.500000 0.600000 0.500000'
    assert classification_summary['images'] == 2
    assert len(manifest_lines) == 2
    assert 'banana split' in manifest_lines[1]
    assert 'apple' in data_yaml


def test_report_missing_bbox_groups_labeled_records_without_boxes(tmp_path: Path):
    dataset_dir = tmp_path / 'dataset'
    image_path = dataset_dir / 'images' / '2026-03-01' / 'scan-1.jpg'
    _write_image(image_path)
    records_dir = dataset_dir / 'records'
    records_dir.mkdir(parents=True, exist_ok=True)
    (records_dir / 'scan-1.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-1',
                'image_path': image_path.as_posix(),
                'user_corrected_to': 'banana',
                'bad_photo': False,
                'detection_boxes': [],
            }
        ),
        encoding='utf-8',
    )
    (records_dir / 'scan-2.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-2',
                'image_path': image_path.as_posix(),
                'user_confirmed': True,
                'predicted_product': 'apple',
                'bad_photo': False,
                'detection_boxes': [{'cls': 'apple', 'conf': 0.9, 'xyxy': [1, 2, 50, 60]}],
            }
        ),
        encoding='utf-8',
    )

    summary = collect_missing_bbox_records(dataset_dir=dataset_dir, limit=10, include_bad_photos=False)

    assert summary['total_records'] == 2
    assert summary['human_labeled_records'] == 2
    assert summary['classes_missing_bbox'] == [
        {
            'label': 'banana',
            'count': 1,
            'example_ids': ['scan-1'],
        }
    ]


def test_report_missing_bbox_can_filter_by_label(tmp_path: Path):
    dataset_dir = tmp_path / 'dataset'
    image_path = dataset_dir / 'images' / '2026-03-01' / 'scan-1.jpg'
    _write_image(image_path)
    records_dir = dataset_dir / 'records'
    records_dir.mkdir(parents=True, exist_ok=True)
    (records_dir / 'scan-1.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-1',
                'image_path': image_path.as_posix(),
                'user_corrected_to': 'banana',
                'bad_photo': False,
                'detection_boxes': [],
            }
        ),
        encoding='utf-8',
    )
    (records_dir / 'scan-2.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-2',
                'image_path': image_path.as_posix(),
                'user_corrected_to': 'coca cola',
                'bad_photo': False,
                'detection_boxes': [],
            }
        ),
        encoding='utf-8',
    )

    summary = collect_missing_bbox_records(
        dataset_dir=dataset_dir,
        limit=10,
        include_bad_photos=False,
        only_label='banana',
    )

    assert summary['only_label'] == 'banana'
    assert summary['classes_missing_bbox'] == [
        {
            'label': 'banana',
            'count': 1,
            'example_ids': ['scan-1'],
        }
    ]


def test_make_fixes_template_writes_null_entries(tmp_path: Path, monkeypatch):
    dataset_dir = tmp_path / 'dataset'
    image_path = dataset_dir / 'images' / '2026-03-01' / 'scan-1.jpg'
    output_path = tmp_path / 'fixes.template.json'
    _write_image(image_path)
    records_dir = dataset_dir / 'records'
    records_dir.mkdir(parents=True, exist_ok=True)
    (records_dir / 'scan-1.json').write_text(
        json.dumps(
            {
                'scan_log_id': 'scan-1',
                'image_path': image_path.as_posix(),
                'user_corrected_to': 'banana',
                'bad_photo': False,
                'detection_boxes': [],
            }
        ),
        encoding='utf-8',
    )
    monkeypatch.setattr(
        'sys.argv',
        [
            'make_fixes_template',
            '--dataset-dir',
            str(dataset_dir),
            '--output',
            str(output_path),
            '--only-label',
            'banana',
        ],
    )

    exit_code = make_fixes_template_main()

    assert exit_code == 0
    saved = json.loads(output_path.read_text(encoding='utf-8'))
    assert saved == {'scan-1': None}


def test_normalize_training_label_merges_known_aliases():
    assert normalize_training_label('Coca Cola') == 'coca_cola'
    assert normalize_training_label('cola') == 'coca_cola'
    assert normalize_training_label('banana split') == 'banana_split'
