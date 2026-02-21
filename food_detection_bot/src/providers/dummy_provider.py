import time

from src.core.detector import Detector
from src.core.types import Detection, DetectionResult


class DummyProvider(Detector):
    def __init__(self, model_id: str = 'dummy-v1') -> None:
        self._model_id = model_id

    @property
    def model_id(self) -> str:
        return self._model_id

    def detect(self, image) -> DetectionResult:
        start = time.perf_counter()
        width, height = image.size
        detections = [
            Detection(label='pizza', confidence=0.91, bbox=[12, 35, min(width - 10, 240), min(height - 10, 310)]),
            Detection(label='salad', confidence=0.62, bbox=[80, 60, min(width - 5, 280), min(height - 5, 330)]),
            Detection(label='french fries', confidence=0.54, bbox=[40, 110, min(width - 20, 220), min(height - 20, 300)]),
        ]
        latency_ms = int((time.perf_counter() - start) * 1000)
        return DetectionResult(
            detections=detections,
            model_id=self.model_id,
            latency_ms=max(latency_ms, 1),
            image_size=(width, height),
        )
