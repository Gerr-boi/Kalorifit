from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from src.main import app


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
                'bad_photo': False,
            },
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['scan_log_id'] == scan_log_id
