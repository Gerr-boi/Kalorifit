from dataclasses import dataclass


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: list[float] | None = None


@dataclass
class TextDetection:
    text: str
    confidence: float
    bbox: list[float] | None = None


@dataclass
class DetectionResult:
    detections: list[Detection]
    model_id: str
    latency_ms: int
    image_size: tuple[int, int]
