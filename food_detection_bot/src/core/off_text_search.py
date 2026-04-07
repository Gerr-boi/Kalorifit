import re
from typing import Any

import httpx

OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'
OFF_USER_AGENT = 'KaloriFit/1.0 (food_detection_bot)'

_STOP_WORDS = {
    'the',
    'and',
    'for',
    'with',
    'food',
    'meal',
    'dish',
    'bottle',
    'drink',
    'beverage',
    'pack',
    'package',
    'container',
    'label',
}


def _normalize_text(value: str) -> str:
    cleaned = re.sub(r'[^\w\s-]', ' ', str(value or '').strip().lower(), flags=re.UNICODE)
    return ' '.join(cleaned.split())


def _tokens(value: str) -> list[str]:
    return [token for token in _normalize_text(value).split(' ') if len(token) > 1 and token not in _STOP_WORDS]


def _score_candidate(name: str, brand: str, query_tokens: list[str]) -> float:
    if not query_tokens:
        return 0.0
    name_tokens = set(_tokens(name))
    brand_tokens = set(_tokens(brand))
    token_set = name_tokens | brand_tokens
    overlap = sum(1 for token in query_tokens if token in token_set)
    if overlap <= 0:
        return 0.0

    coverage = overlap / max(1, len(query_tokens))
    score = 0.35 + (0.45 * coverage)
    full_name = _normalize_text(name)
    query_text = ' '.join(query_tokens)
    if query_text and query_text in full_name:
        score += 0.12
    return min(0.99, score)


async def search_open_food_facts_by_text(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    query_norm = _normalize_text(query)
    query_tokens = _tokens(query_norm)
    if len(query_tokens) < 2:
        return []

    params = {
        'search_terms': query_norm,
        'search_simple': '1',
        'action': 'process',
        'json': '1',
        'page_size': str(max(10, top_k * 6)),
    }

    timeout = httpx.Timeout(connect=4.0, read=6.0, write=4.0, pool=4.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={'User-Agent': OFF_USER_AGENT}) as client:
            response = await client.get(OFF_SEARCH_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []

    products = payload.get('products', []) if isinstance(payload, dict) else []
    if not isinstance(products, list):
        return []

    ranked: list[dict[str, Any]] = []
    for product in products:
        if not isinstance(product, dict):
            continue
        name = str(product.get('product_name') or '').strip()
        brand = str(product.get('brands') or '').strip()
        if not name:
            continue
        score = _score_candidate(name=name, brand=brand, query_tokens=query_tokens)
        if score <= 0:
            continue
        ranked.append(
            {
                'name': name,
                'brand': brand or None,
                'confidence': round(score, 4),
                'code': str(product.get('code') or '').strip() or None,
                'source': 'off_text_search',
            }
        )

    ranked.sort(key=lambda row: row['confidence'], reverse=True)
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in ranked:
        key = _normalize_text(f"{row.get('brand') or ''} {row.get('name') or ''}")
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(row)
        if len(deduped) >= max(1, top_k):
            break
    return deduped
