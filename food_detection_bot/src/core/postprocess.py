from collections import defaultdict

from src.core.types import Detection
from src.core.nutrition_map import to_canonical_food
from src.core.text_ties import score_text_tie


_ALIAS = {
    'french fries': 'fries',
    'chips': 'fries',
    'fries': 'fries',
    'pizzas': 'pizza',
    'burgers': 'burger',
}


def _normalize_label(label: str) -> str:
    value = ' '.join(label.strip().lower().split())
    if value.endswith('s') and len(value) > 3 and value not in {'fries'}:
        value = value[:-1]
    value = _ALIAS.get(value, value)
    return to_canonical_food(value)


def filter_detections(detections: list[Detection], threshold: float) -> list[Detection]:
    return [d for d in detections if d.confidence >= threshold]


def merge_duplicates(detections: list[Detection]) -> list[Detection]:
    grouped: dict[str, Detection] = {}
    for detection in detections:
        normalized = _normalize_label(detection.label)
        if not normalized:
            continue
        current = Detection(label=normalized, confidence=detection.confidence, bbox=detection.bbox)
        prev = grouped.get(normalized)
        if not prev or current.confidence > prev.confidence:
            grouped[normalized] = current
    return sorted(grouped.values(), key=lambda item: item.confidence, reverse=True)


def build_items(detections: list[Detection], top_k: int, text_tokens: set[str] | None = None) -> list[dict]:
    confidence_by_label: dict[str, float] = {}
    count_by_label = defaultdict(int)
    text_tokens = text_tokens or set()

    for detection in detections:
        label = _normalize_label(detection.label)
        if not label:
            continue
        count_by_label[label] += 1
        tie_boost = score_text_tie(label, text_tokens)
        boosted_confidence = min(0.99, detection.confidence + tie_boost)
        confidence_by_label[label] = max(confidence_by_label.get(label, 0.0), boosted_confidence)

    ranked = sorted(confidence_by_label.keys(), key=lambda key: confidence_by_label[key], reverse=True)
    if top_k > 0:
        ranked = ranked[:top_k]

    return [
        {
            'name': label,
            'confidence': round(confidence_by_label[label], 4),
            'count': count_by_label[label],
        }
        for label in ranked
    ]
