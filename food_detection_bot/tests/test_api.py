import json
from pathlib import Path
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from src.main import app
from src.config import get_settings


def make_test_image_bytes() -> bytes:
    image = Image.new('RGB', (120, 80), color='white')
    buf = BytesIO()
    image.save(buf, format='JPEG')
    return buf.getvalue()


def test_health_ok():
    with TestClient(app) as client:
        response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['ok'] is True
    assert body['model_loaded'] is True


def test_detect_returns_items():
    image_bytes = make_test_image_bytes()
    with TestClient(app) as client:
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


def test_feedback_updates_logged_scan():
    image_bytes = make_test_image_bytes()
    with TestClient(app) as client:
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
    record_path = Path(get_settings().dataset_dir) / 'records' / f'{scan_log_id}.json'
    saved = json.loads(record_path.read_text(encoding='utf-8'))
    assert saved['feedback_context']['packagingType'] == 'can'
    assert saved['data_quality']['quality_bucket'] == 'low'
    assert 'specular_glare' in saved['failure_tags']
    assert saved['training_priority'] in {'high', 'medium'}
    assert saved['active_learning']['candidate'] is True
    assert isinstance(saved['active_learning']['reasons'], list)
