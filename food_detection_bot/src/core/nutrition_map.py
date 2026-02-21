_CANONICAL = {
    'french fries': 'fries',
    'chips': 'fries',
    'spaghetti bolognese': 'pasta',
    'cola': 'soda',
    'coke': 'soda',
}


def to_canonical_food(label: str) -> str:
    normalized = label.strip().lower()
    if not normalized:
        return normalized
    return _CANONICAL.get(normalized, normalized)
