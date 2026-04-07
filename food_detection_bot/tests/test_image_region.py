from PIL import Image

from src.core.image_region import build_ocr_crop_candidates
from src.core.types import Detection


def test_build_ocr_crop_candidates_includes_fallback_windows():
    image = Image.new('RGB', (1000, 800), color='white')
    detections = [
        Detection(label='bottle', confidence=0.8, bbox=[180, 120, 760, 700]),
        Detection(label='label', confidence=0.55, bbox=[260, 220, 720, 520]),
    ]
    crops = build_ocr_crop_candidates(image, detections)
    names = [name for name, _ in crops]
    assert 'full_image' in names
    assert 'center_window' in names
    assert 'upper_center_window' in names
    assert len(crops) >= 3


def test_build_ocr_crop_candidates_works_without_detections():
    image = Image.new('RGB', (640, 480), color='white')
    crops = build_ocr_crop_candidates(image, [])
    names = [name for name, _ in crops]
    assert names[0] == 'full_image'
    assert 'center_window' in names
    assert 'upper_center_window' in names
