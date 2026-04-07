import re

LABEL_ALIASES = {
    'coca cola': 'coca_cola',
    'coca-cola': 'coca_cola',
    'cola': 'coca_cola',
}


def normalize_training_label(label: str | None) -> str | None:
    if label is None:
        return None
    cleaned = re.sub(r'[\s\-]+', ' ', str(label).strip().lower())
    cleaned = re.sub(r'[^\w\s]', '', cleaned).strip()
    if not cleaned:
        return None
    if cleaned == '__non_food__':
        return cleaned
    if cleaned in LABEL_ALIASES:
        return LABEL_ALIASES[cleaned]
    return cleaned.replace(' ', '_')
