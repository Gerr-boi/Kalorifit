from PIL import Image

from src.core.types import Detection


def pick_package_detection(detections: list[Detection], class_name: str = 'package') -> Detection | None:
    normalized_target = class_name.strip().lower()
    package_hits = [d for d in detections if d.label.strip().lower() == normalized_target]
    if not package_hits:
        return None
    return max(package_hits, key=lambda item: item.confidence)


def _area(detection: Detection) -> float:
    bbox = detection.bbox
    if not bbox or len(bbox) != 4:
        return 0.0
    x1, y1, x2, y2 = bbox
    return max(0.0, float(x2) - float(x1)) * max(0.0, float(y2) - float(y1))


def pick_detection_for_crop(
    detections: list[Detection],
    class_name: str = 'package',
    image_size: tuple[int, int] | None = None,
    max_area_ratio: float = 0.9,
    min_confidence: float = 0.15,
    preferred_labels: set[str] | None = None,
) -> tuple[Detection | None, str]:
    package_hit = pick_package_detection(detections, class_name)
    if package_hit:
        return package_hit, 'package_class'

    with_bbox = [d for d in detections if d.bbox and len(d.bbox) == 4]
    if not with_bbox:
        return None, 'none'

    image_area = None
    if image_size:
        width, height = image_size
        if width > 0 and height > 0:
            image_area = float(width * height)

    filtered: list[Detection] = []
    for det in with_bbox:
        if det.confidence < min_confidence:
            continue
        det_area = _area(det)
        if image_area and image_area > 0:
            ratio = det_area / image_area
            if ratio > max_area_ratio:
                continue
        filtered.append(det)

    candidates = filtered if filtered else with_bbox
    labels = {label.strip().lower() for label in (preferred_labels or set()) if label.strip()}
    if labels:
        preferred = [d for d in candidates if d.label.strip().lower() in labels]
        if preferred:
            candidates = preferred

    # Fallback for COCO-like models without a dedicated package class:
    # choose the largest visible detection and break ties by confidence.
    best = max(candidates, key=lambda d: (_area(d), d.confidence))
    return best, 'fallback_largest_box'


def crop_to_bbox(image: Image.Image, bbox: list[float] | None) -> Image.Image | None:
    if not bbox or len(bbox) != 4:
        return None
    width, height = image.size
    x1, y1, x2, y2 = bbox
    left = max(0, min(int(round(x1)), width - 1))
    top = max(0, min(int(round(y1)), height - 1))
    right = max(left + 1, min(int(round(x2)), width))
    bottom = max(top + 1, min(int(round(y2)), height))
    if right <= left or bottom <= top:
        return None
    return image.crop((left, top, right, bottom))
