from src.core.types import TextDetection
from PIL import Image, ImageFilter, ImageOps


def _normalize_text(value: str) -> str:
    return ' '.join((value or '').strip().lower().split())


def _prepare_ocr_variants(image) -> list[Image.Image]:
    base = image.convert('RGB')
    gray = ImageOps.grayscale(base)
    rot90 = base.rotate(90, expand=True)
    rot270 = base.rotate(270, expand=True)
    variants: list[Image.Image] = [
        base,
        gray.convert('RGB'),
        ImageOps.autocontrast(gray, cutoff=2).convert('RGB'),
        gray.filter(ImageFilter.SHARPEN).convert('RGB'),
        rot90,
        rot270,
        ImageOps.autocontrast(ImageOps.grayscale(rot90), cutoff=2).convert('RGB'),
        ImageOps.autocontrast(ImageOps.grayscale(rot270), cutoff=2).convert('RGB'),
    ]

    # Upscale for small text often seen on bottles/cans.
    w, h = base.size
    if max(w, h) < 1400:
        scale = 1.7
        up = base.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.BICUBIC)
        variants.append(up)
        variants.append(ImageOps.autocontrast(ImageOps.grayscale(up), cutoff=2).convert('RGB'))
        variants.append(up.rotate(90, expand=True))
        variants.append(up.rotate(270, expand=True))
    return variants


def _merge_text_detections(detections: list[TextDetection]) -> list[TextDetection]:
    best_by_key: dict[str, TextDetection] = {}
    for entry in detections:
        text = _normalize_text(entry.text)
        if not text:
            continue
        key = text
        prev = best_by_key.get(key)
        if prev is None or entry.confidence > prev.confidence:
            best_by_key[key] = TextDetection(text=text, confidence=entry.confidence, bbox=entry.bbox)
    return sorted(best_by_key.values(), key=lambda item: item.confidence, reverse=True)


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

        detections: list[TextDetection] = []
        variants = _prepare_ocr_variants(image)
        tesseract_configs = ('--oem 3 --psm 6', '--oem 3 --psm 11')

        for variant in variants:
            for config in tesseract_configs:
                try:
                    data = pytesseract.image_to_data(
                        variant,
                        config=config,
                        output_type=pytesseract.Output.DICT,
                    )
                except Exception:
                    continue

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
        return _merge_text_detections(detections)


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
        detections: list[TextDetection] = []
        try:
            import numpy as np
        except Exception:
            return []

        for variant in _prepare_ocr_variants(image):
            try:
                result = self._engine.ocr(np.array(variant), cls=True)
            except Exception:
                continue
            if not result:
                continue

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

        return _merge_text_detections(detections)


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
