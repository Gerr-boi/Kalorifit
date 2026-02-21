from src.core.types import TextDetection


def _norm(value: str) -> str:
    return ' '.join(value.strip().lower().split())


def extract_text_tokens(text_detections: list[TextDetection], conf_threshold: float = 0.0) -> set[str]:
    tokens: set[str] = set()
    for item in text_detections:
        if item.confidence < conf_threshold:
            continue
        normalized = _norm(item.text)
        if not normalized:
            continue
        for token in normalized.split(' '):
            if len(token) > 1:
                tokens.add(token)
        tokens.add(normalized)
    return tokens


def score_text_tie(label: str, text_tokens: set[str]) -> float:
    normalized = _norm(label)
    if not normalized or not text_tokens:
        return 0.0

    label_tokens = [token for token in normalized.split(' ') if token]
    overlap = sum(1 for token in label_tokens if token in text_tokens)
    if overlap <= 0:
        return 0.0
    return min(0.2, 0.05 * overlap)
