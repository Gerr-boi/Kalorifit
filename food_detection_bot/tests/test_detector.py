from PIL import Image

from src.config import Settings
from src.core.detector import create_detector


def test_create_dummy_detector_and_detect():
    detector = create_detector(Settings(provider='dummy'))
    image = Image.new('RGB', (320, 240), color='white')

    result = detector.detect(image)

    assert result.model_id == 'dummy-v1'
    assert result.image_size == (320, 240)
    assert len(result.detections) >= 1
    assert 0.0 <= result.detections[0].confidence <= 1.0


def test_create_ensemble_detector():
    detector = create_detector(Settings(provider='ensemble', ensemble_providers='dummy,dummy'))

    assert detector.model_id == 'dummy-v1+dummy-v1'
