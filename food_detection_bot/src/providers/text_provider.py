from src.core.types import TextDetection


class TextProvider:
    def detect_text(self, image) -> list[TextDetection]:
        raise NotImplementedError

    @property
    def model_id(self) -> str:
        return 'text-provider'

    def status(self) -> dict:
        return {'available': True, 'message': None}


class TesseractTextProvider(TextProvider):
    def __init__(self) -> None:
        import shutil

        self._available = shutil.which('tesseract') is not None
        self._message = None if self._available else 'tesseract binary not found in PATH'

    @property
    def model_id(self) -> str:
        return 'tesseract-ocr'

    def status(self) -> dict:
        return {'available': self._available, 'message': self._message}

    def detect_text(self, image) -> list[TextDetection]:
        if not self._available:
            return []
        try:
            import pytesseract
        except ImportError:
            return []

        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        except Exception:
            return []

        detections: list[TextDetection] = []
        n = len(data.get('text', []))
        for i in range(n):
            text = (data.get('text', [''])[i] or '').strip()
            if not text:
                continue
            conf_raw = data.get('conf', ['-1'])[i]
            try:
                conf = float(conf_raw)
            except Exception:
                conf = -1.0
            if conf < 0:
                continue
            left = float(data.get('left', [0])[i])
            top = float(data.get('top', [0])[i])
            width = float(data.get('width', [0])[i])
            height = float(data.get('height', [0])[i])
            detections.append(
                TextDetection(
                    text=text,
                    confidence=max(0.0, min(1.0, conf / 100.0)),
                    bbox=[left, top, left + width, top + height],
                )
            )
        return detections


class PaddleTextProvider(TextProvider):
    def __init__(self) -> None:
        self._engine = None
        self._message = None
        try:
            from paddleocr import PaddleOCR

            self._engine = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        except Exception as exc:
            self._message = f'paddleocr unavailable: {exc}'

    @property
    def model_id(self) -> str:
        return 'paddleocr'

    def status(self) -> dict:
        return {'available': self._engine is not None, 'message': self._message}

    def detect_text(self, image) -> list[TextDetection]:
        if self._engine is None:
            return []
        try:
            result = self._engine.ocr(image, cls=True)
        except Exception:
            return []

        detections: list[TextDetection] = []
        if not result:
            return detections

        lines = result[0] if isinstance(result, list) else []
        for line in lines or []:
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            points = line[0]
            txt_meta = line[1]
            if not isinstance(txt_meta, (list, tuple)) or len(txt_meta) < 2:
                continue
            text = str(txt_meta[0] or '').strip()
            if not text:
                continue
            try:
                conf = float(txt_meta[1])
            except Exception:
                conf = 0.0

            xs = [float(point[0]) for point in points if isinstance(point, (list, tuple)) and len(point) >= 2]
            ys = [float(point[1]) for point in points if isinstance(point, (list, tuple)) and len(point) >= 2]
            bbox = [min(xs), min(ys), max(xs), max(ys)] if xs and ys else None
            detections.append(TextDetection(text=text, confidence=max(0.0, min(1.0, conf)), bbox=bbox))

        return detections


def create_text_provider(name: str) -> TextProvider:
    provider = name.strip().lower()
    if provider == 'paddleocr':
        paddle = PaddleTextProvider()
        if paddle.status().get('available'):
            return paddle
        return TesseractTextProvider()
    if provider == 'tesseract':
        return TesseractTextProvider()
    paddle = PaddleTextProvider()
    if paddle.status().get('available'):
        return paddle
    return TesseractTextProvider()
