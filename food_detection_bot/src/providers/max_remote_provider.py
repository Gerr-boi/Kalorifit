import io
import time

import httpx

from src.core.detector import Detector
from src.core.types import Detection, DetectionResult


def _join_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _normalized_to_absolute_bbox(bbox: list[float] | tuple[float, ...] | None, image_size: tuple[int, int]) -> list[float] | None:
    if not bbox or len(bbox) != 4:
        return None

    width, height = image_size
    ymin, xmin, ymax, xmax = [float(value) for value in bbox]
    return [
        max(0.0, min(float(width), xmin * width)),
        max(0.0, min(float(height), ymin * height)),
        max(0.0, min(float(width), xmax * width)),
        max(0.0, min(float(height), ymax * height)),
    ]


class MaxRemoteProvider(Detector):
    def __init__(
        self,
        base_url: str = 'http://127.0.0.1:5000',
        predict_path: str = '/model/predict',
        timeout_ms: int = 12000,
        threshold: float = 0.35,
    ) -> None:
        self._base_url = base_url
        self._predict_path = predict_path
        self._timeout = max(int(timeout_ms), 1000) / 1000.0
        self._threshold = float(threshold)
        self._model_id = 'max-object-detector'

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def weights_path(self) -> str | None:
        return None

    def detect(self, image) -> DetectionResult:
        start = time.perf_counter()
        width, height = image.size
        payload = io.BytesIO()
        image.save(payload, format='JPEG', quality=92)
        payload.seek(0)

        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(
                _join_url(self._base_url, self._predict_path),
                files={'image': ('capture.jpg', payload.getvalue(), 'image/jpeg')},
                data={'threshold': str(self._threshold)},
            )
        response.raise_for_status()
        body = response.json()

        detections: list[Detection] = []
        for row in body.get('predictions', []):
            label = str(row.get('label') or '').strip()
            probability = float(row.get('probability') or 0.0)
            if not label:
                continue
            detections.append(
                Detection(
                    label=label,
                    confidence=probability,
                    bbox=_normalized_to_absolute_bbox(row.get('detection_box'), (width, height)),
                )
            )

        latency_ms = int((time.perf_counter() - start) * 1000)
        return DetectionResult(
            detections=detections,
            model_id=self.model_id,
            latency_ms=max(latency_ms, 1),
            image_size=(width, height),
        )
