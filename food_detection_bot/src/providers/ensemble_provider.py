import time

from src.core.detector import Detector
from src.core.types import Detection, DetectionResult


def _iou(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right or len(left) != 4 or len(right) != 4:
        return 0.0
    lx1, ly1, lx2, ly2 = [float(v) for v in left]
    rx1, ry1, rx2, ry2 = [float(v) for v in right]
    ix1 = max(lx1, rx1)
    iy1 = max(ly1, ry1)
    ix2 = min(lx2, rx2)
    iy2 = min(ly2, ry2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    intersection = iw * ih
    if intersection <= 0:
        return 0.0
    left_area = max(0.0, lx2 - lx1) * max(0.0, ly2 - ly1)
    right_area = max(0.0, rx2 - rx1) * max(0.0, ry2 - ry1)
    union = left_area + right_area - intersection
    return (intersection / union) if union > 0 else 0.0


class EnsembleProvider(Detector):
    def __init__(self, detectors: list[Detector], dedup_iou: float = 0.55) -> None:
        if not detectors:
            raise ValueError('EnsembleProvider requires at least one detector.')
        self._detectors = detectors
        self._dedup_iou = float(dedup_iou)

    @property
    def model_id(self) -> str:
        return '+'.join(detector.model_id for detector in self._detectors)

    @property
    def weights_path(self) -> str | None:
        return None

    def detect(self, image) -> DetectionResult:
        start = time.perf_counter()
        merged: list[Detection] = []

        for detector in self._detectors:
            result = detector.detect(image)
            for candidate in result.detections:
                replaced = False
                normalized_label = candidate.label.strip().lower()
                for index, existing in enumerate(merged):
                    if existing.label.strip().lower() != normalized_label:
                        continue
                    if _iou(existing.bbox, candidate.bbox) < self._dedup_iou:
                        continue
                    if candidate.confidence > existing.confidence:
                        merged[index] = candidate
                    replaced = True
                    break
                if not replaced:
                    merged.append(candidate)

        merged.sort(key=lambda row: row.confidence, reverse=True)
        latency_ms = int((time.perf_counter() - start) * 1000)
        return DetectionResult(
            detections=merged,
            model_id=self.model_id,
            latency_ms=max(latency_ms, 1),
            image_size=image.size,
        )
