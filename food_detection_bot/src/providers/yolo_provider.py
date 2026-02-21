import time
from pathlib import Path

from src.core.detector import Detector
from src.core.types import Detection, DetectionResult


class YoloProvider(Detector):
    def __init__(self, model_id: str = 'yolo11n.pt') -> None:
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError('ultralytics is required for PROVIDER=yolo. Install it first.') from exc

        self._model_id = model_id
        self._model = YOLO(model_id)

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def weights_path(self) -> str | None:
        ckpt_path = getattr(self._model, 'ckpt_path', None)
        if ckpt_path:
            try:
                return str(Path(ckpt_path).resolve())
            except Exception:
                return str(ckpt_path)
        model_candidate = Path(self._model_id)
        if model_candidate.exists():
            return str(model_candidate.resolve())
        return None

    def detect(self, image) -> DetectionResult:
        start = time.perf_counter()
        width, height = image.size
        prediction = self._model(image, verbose=False)

        detections: list[Detection] = []
        if prediction:
            result = prediction[0]
            names = result.names
            boxes = result.boxes
            if boxes is not None:
                for cls_id, conf, xyxy in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist()):
                    label = str(names.get(int(cls_id), int(cls_id)))
                    detections.append(
                        Detection(
                            label=label,
                            confidence=float(conf),
                            bbox=[float(v) for v in xyxy],
                        )
                    )

        latency_ms = int((time.perf_counter() - start) * 1000)
        return DetectionResult(
            detections=detections,
            model_id=self.model_id,
            latency_ms=max(latency_ms, 1),
            image_size=(width, height),
        )
