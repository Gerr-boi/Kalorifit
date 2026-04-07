import json
from pathlib import Path
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from src.core.types import DetectionResult


def make_test_image_bytes() -> bytes:
    image = Image.new('RGB', (120, 80), color='white')
    buf = BytesIO()
    image.save(buf, format='JPEG')
    return buf.getvalue()


def test_health_ok(isolated_app_main):
    with TestClient(isolated_app_main.app) as client:
        response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['ok'] is True
    assert body['model_loaded'] is True


def test_detect_returns_items(isolated_app_main):
    image_bytes = make_test_image_bytes()
    with TestClient(isolated_app_main.app) as client:
        response = client.post('/detect', files={'image': ('test.jpg', image_bytes, 'image/jpeg')})
    assert response.status_code == 200
    body = response.json()
    assert body['ok'] is True
    assert isinstance(body['items'], list)
    assert isinstance(body['detections'], list)
    assert isinstance(body.get('text_detections', []), list)
    assert isinstance(body.get('scan_log_id'), str)
    assert 'packaging_type' in body
    assert 'top_match' in body
    assert isinstance(body.get('alternatives', []), list)
    assert body['debug']['label_resolution_state'] in {'ready', 'needs_recapture'}
    assert isinstance(body['debug'].get('dish_predictions', []), list)


def test_detect_marks_needs_recapture_when_no_signal(isolated_app_main):
    image_bytes = make_test_image_bytes()
    app = isolated_app_main.app

    class EmptyDetector:
        model_id = 'empty-detector'

        def detect(self, _image):
            return DetectionResult(detections=[], model_id=self.model_id, latency_ms=1, image_size=(120, 80))

    class EmptyDishClassifier:
        model_id = 'empty-dish'

        def predict(self, _image, top_k=5):
            _ = top_k
            return []

    try:
        with TestClient(app) as client:
            original_detector = app.state.detector
            original_dish_classifier = app.state.dish_classifier
            original_dish_classifier_status = app.state.dish_classifier_status
            app.state.detector = EmptyDetector()
            app.state.dish_classifier = EmptyDishClassifier()
            app.state.dish_classifier_status = {'available': True, 'message': None}
            response = client.post('/detect', files={'image': ('test.jpg', image_bytes, 'image/jpeg')})
    finally:
        app.state.detector = original_detector
        app.state.dish_classifier = original_dish_classifier
        app.state.dish_classifier_status = original_dish_classifier_status

    assert response.status_code == 200
    body = response.json()
    assert body['debug']['label_resolution_state'] == 'needs_recapture'
    assert isinstance(body['debug']['retry_guidance'], str)


def test_detect_exposes_dish_predictions_for_fallback_resolution(isolated_app_main):
    image_bytes = make_test_image_bytes()
    app = isolated_app_main.app

    class EmptyDetector:
        model_id = 'empty-detector'

        def detect(self, _image):
            return DetectionResult(detections=[], model_id=self.model_id, latency_ms=1, image_size=(120, 80))

    class StubDishClassifier:
        model_id = 'stub-dish'

        def predict(self, _image, top_k=5):
            _ = top_k
            return [{'label': 'omelette', 'confidence': 0.84, 'source': 'dish_classifier'}]

    try:
        with TestClient(app) as client:
            original_detector = app.state.detector
            original_dish_classifier = app.state.dish_classifier
            original_dish_classifier_status = app.state.dish_classifier_status
            app.state.detector = EmptyDetector()
            app.state.dish_classifier = StubDishClassifier()
            app.state.dish_classifier_status = {'available': True, 'message': None}
            response = client.post('/detect', files={'image': ('test.jpg', image_bytes, 'image/jpeg')})
    finally:
        app.state.detector = original_detector
        app.state.dish_classifier = original_dish_classifier
        app.state.dish_classifier_status = original_dish_classifier_status

    assert response.status_code == 200
    body = response.json()
    assert body['debug']['label_resolution_state'] == 'ready'
    assert body['debug']['dish_predictions'] == [
        {'label': 'omelette', 'confidence': 0.84, 'source': 'dish_classifier'}
    ]


def test_feedback_updates_logged_scan(isolated_app_main, isolated_dataset_dir: Path):
    image_bytes = make_test_image_bytes()
    with TestClient(isolated_app_main.app) as client:
        detect_response = client.post('/detect', files={'image': ('test.jpg', image_bytes, 'image/jpeg')})
        scan_log_id = detect_response.json().get('scan_log_id')
        response = client.post(
            '/feedback',
            json={
                'scan_log_id': scan_log_id,
                'user_confirmed': False,
                'user_corrected_to': 'banana',
                'not_food': False,
                'bad_photo': True,
                'corrected_detection': {
                    'label': 'banana',
                    'bbox': [12, 10, 108, 74],
                },
                'feedback_context': {
                    'frontVisibilityScore': 0.31,
                    'selectedFrameSharpness': 0.19,
                    'selectedFrameGlare': 0.83,
                    'selectedFrameBrightness': 0.24,
                    'packagingType': 'can',
                    'topMatchMargin': 0.03,
                    'shouldPromptRetake': True,
                },
            },
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['scan_log_id'] == scan_log_id
    record_path = isolated_dataset_dir / 'records' / f'{scan_log_id}.json'
    saved = json.loads(record_path.read_text(encoding='utf-8'))
    assert saved['feedback_context']['packagingType'] == 'can'
    assert saved['corrected_detection']['bbox'] == [12.0, 10.0, 108.0, 74.0]
    assert saved['data_quality']['quality_bucket'] == 'low'
    assert 'specular_glare' in saved['failure_tags']
    assert saved['training_priority'] in {'high', 'medium'}
    assert saved['active_learning']['candidate'] is True
    assert isinstance(saved['active_learning']['reasons'], list)


def test_detect_writes_only_to_isolated_dataset(isolated_app_main, isolated_dataset_dir: Path):
    image_bytes = make_test_image_bytes()
    repo_records_dir = Path(__file__).resolve().parents[1] / 'dataset' / 'records'
    before = len(list(repo_records_dir.glob('*.json'))) if repo_records_dir.exists() else 0

    with TestClient(isolated_app_main.app) as client:
        response = client.post('/detect', files={'image': ('test.jpg', image_bytes, 'image/jpeg')})

    assert response.status_code == 200
    after = len(list(repo_records_dir.glob('*.json'))) if repo_records_dir.exists() else 0
    isolated_records = list((isolated_dataset_dir / 'records').glob('*.json'))
    assert after == before
    assert len(isolated_records) == 1
