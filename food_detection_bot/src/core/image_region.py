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


def _crop_relative(
    image: Image.Image,
    *,
    left_ratio: float,
    top_ratio: float,
    width_ratio: float,
    height_ratio: float,
) -> Image.Image | None:
    width, height = image.size
    if width <= 0 or height <= 0:
        return None
    left = max(0, int(round(width * left_ratio)))
    top = max(0, int(round(height * top_ratio)))
    right = min(width, int(round(left + width * width_ratio)))
    bottom = min(height, int(round(top + height * height_ratio)))
    if right <= left or bottom <= top:
        return None
    return image.crop((left, top, right, bottom))


def _label_like_detection(detections: list[Detection], image_size: tuple[int, int]) -> Detection | None:
    width, height = image_size
    image_area = max(1.0, float(width * height))
    candidates: list[Detection] = []
    for det in detections:
        if not det.bbox or len(det.bbox) != 4:
            continue
        x1, y1, x2, y2 = det.bbox
        bw = max(0.0, float(x2) - float(x1))
        bh = max(0.0, float(y2) - float(y1))
        if bw < 1 or bh < 1:
            continue
        aspect = bw / max(1.0, bh)
        area_ratio = (bw * bh) / image_area
        if det.confidence < 0.12:
            continue
        if area_ratio < 0.03 or area_ratio > 0.75:
            continue
        if aspect < 0.5 or aspect > 4.5:
            continue
        candidates.append(det)
    if not candidates:
        return None
    return max(candidates, key=lambda item: (_area(item), item.confidence))


def build_ocr_crop_candidates(
    image: Image.Image,
    detections: list[Detection],
    *,
    class_name: str = 'package',
    max_area_ratio: float = 0.9,
    min_confidence: float = 0.15,
    preferred_labels: set[str] | None = None,
) -> list[tuple[str, Image.Image]]:
    candidates: list[tuple[str, Image.Image]] = [('full_image', image)]
    seen_sizes = {(image.width, image.height)}

    picked, _ = pick_detection_for_crop(
        detections,
        class_name=class_name,
        image_size=image.size,
        max_area_ratio=max_area_ratio,
        min_confidence=min_confidence,
        preferred_labels=preferred_labels,
    )
    picked_crop = crop_to_bbox(image, picked.bbox if picked else None)
    if picked_crop and picked_crop.size not in seen_sizes:
        candidates.append(('detected_package', picked_crop))
        seen_sizes.add(picked_crop.size)

    label_like = _label_like_detection(detections, image.size)
    label_like_crop = crop_to_bbox(image, label_like.bbox if label_like else None)
    if label_like_crop and label_like_crop.size not in seen_sizes:
        candidates.append(('largest_label_like_box', label_like_crop))
        seen_sizes.add(label_like_crop.size)

    center_crop = _crop_relative(
        image,
        left_ratio=0.16,
        top_ratio=0.20,
        width_ratio=0.68,
        height_ratio=0.62,
    )
    if center_crop and center_crop.size not in seen_sizes:
        candidates.append(('center_window', center_crop))
        seen_sizes.add(center_crop.size)

    upper_center_crop = _crop_relative(
        image,
        left_ratio=0.16,
        top_ratio=0.08,
        width_ratio=0.68,
        height_ratio=0.60,
    )
    if upper_center_crop and upper_center_crop.size not in seen_sizes:
        candidates.append(('upper_center_window', upper_center_crop))
        seen_sizes.add(upper_center_crop.size)

    return candidates
