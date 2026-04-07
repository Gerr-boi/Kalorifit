import json
import re
from dataclasses import dataclass
from pathlib import Path

_GENERIC_PRODUCT_TOKENS = {
    'bottle',
    'drink',
    'soda',
    'cola',
    'can',
    'energy',
    'water',
    'juice',
    'milk',
}


def _normalize_text(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = re.sub(r'[^\w\s]', ' ', lowered, flags=re.UNICODE)
    return ' '.join(cleaned.split())


def _tokenize(value: str) -> list[str]:
    normalized = _normalize_text(value)
    return [token for token in normalized.split(' ') if len(token) > 1]


def _normalize_barcode(value: str | None) -> str:
    return re.sub(r'[\s\-]', '', str(value or '').strip())


@dataclass
class ProductRecord:
    product_id: str
    brand: str
    product_name: str
    aliases: list[str]
    barcode: str | None
    keywords: list[str]

    @property
    def display_name(self) -> str:
        brand = self.brand.strip()
        name = self.product_name.strip()
        if brand and name:
            return f'{brand} {name}'
        return name or brand


class ProductCatalog:
    def __init__(self, path: str):
        self._path = self._resolve_path(path)
        self._items = self._load_items(self._path)

    def _resolve_path(self, path: str) -> Path:
        candidate = Path(path)
        if candidate.exists() or candidate.is_absolute():
            return candidate
        module_root = Path(__file__).resolve().parents[1]
        fallback = module_root / 'data' / 'products.json'
        if fallback.exists():
            return fallback
        return candidate

    @property
    def size(self) -> int:
        return len(self._items)

    def _load_items(self, path: Path) -> list[ProductRecord]:
        if not path.exists():
            return []
        raw = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(raw, list):
            return []

        records: list[ProductRecord] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            brand = str(row.get('brand') or '').strip()
            product_name = str(row.get('product_name') or '').strip()
            if not brand and not product_name:
                continue
            product_id = str(row.get('id') or f'{brand}:{product_name}').strip()
            aliases = [str(value).strip() for value in row.get('aliases', []) if str(value).strip()]
            keywords = [str(value).strip() for value in row.get('keywords', []) if str(value).strip()]
            barcode_raw = str(row.get('barcode') or '').strip()
            records.append(
                ProductRecord(
                    product_id=product_id,
                    brand=brand,
                    product_name=product_name,
                    aliases=aliases,
                    barcode=barcode_raw or None,
                    keywords=keywords,
                )
            )
        return records

    def rank_candidates(self, *, ocr_lines: list[str], barcode: str | None, top_k: int = 5) -> list[dict]:
        if not self._items:
            return []

        clean_ocr_lines = [line for line in (_normalize_text(line) for line in ocr_lines) if line]
        ocr_blob = ' '.join(clean_ocr_lines)
        ocr_tokens = set(_tokenize(ocr_blob))
        barcode_norm = _normalize_barcode(barcode)

        ranked: list[dict] = []
        for item in self._items:
            score = 0.0
            reasons: list[str] = []

            if barcode_norm and item.barcode and barcode_norm == _normalize_barcode(item.barcode):
                score = 1.0
                reasons.append('barcode_exact')
                ranked.append(
                    {
                        'product_id': item.product_id,
                        'name': item.display_name,
                        'brand': item.brand,
                        'product_name': item.product_name,
                        'confidence': 1.0,
                        'reasons': reasons,
                        'barcode': item.barcode,
                    }
                )
                continue

            brand_norm = _normalize_text(item.brand)
            name_norm = _normalize_text(item.product_name)
            alias_norms = [_normalize_text(alias) for alias in item.aliases]
            keyword_norms = [_normalize_text(keyword) for keyword in item.keywords]

            brand_tokens = set(_tokenize(brand_norm))
            name_tokens = set(_tokenize(name_norm))
            alias_hits = [alias for alias in alias_norms if alias and alias in ocr_blob]
            brand_overlap = len(brand_tokens & ocr_tokens)
            name_overlap = len(name_tokens & ocr_tokens)
            generic_name_overlap = len((name_tokens & _GENERIC_PRODUCT_TOKENS) & ocr_tokens)

            if brand_norm and brand_norm in ocr_blob:
                score += 0.46
                reasons.append('brand_exact')
            elif brand_overlap > 0:
                score += min(0.32, 0.12 * brand_overlap)
                reasons.append('brand_partial')

            if name_norm and name_norm in ocr_blob:
                score += 0.40
                reasons.append('product_exact')
            elif name_tokens:
                coverage = name_overlap / max(1, len(name_tokens))
                if coverage > 0:
                    score += min(0.35, 0.35 * coverage)
                    reasons.append('product_partial')

            if alias_hits:
                score += min(0.30, 0.12 * len(alias_hits))
                reasons.append('alias_match')

            keyword_hits = [kw for kw in keyword_norms if kw and kw in ocr_blob]
            if keyword_hits:
                score += min(0.15, 0.05 * len(keyword_hits))
                reasons.append('keyword_match')

            if brand_overlap > 0 and name_overlap > 0:
                score += 0.30
                reasons.append('brand_plus_product')

            if brand_overlap == 0 and generic_name_overlap > 0:
                score -= min(0.24, 0.09 * generic_name_overlap)
                reasons.append('generic_without_brand_penalty')

            if score <= 0:
                continue

            ranked.append(
                {
                    'product_id': item.product_id,
                    'name': item.display_name,
                    'brand': item.brand,
                    'product_name': item.product_name,
                    'confidence': round(min(1.0, score), 4),
                    'reasons': reasons,
                    'barcode': item.barcode,
                }
            )

        ranked.sort(key=lambda row: row['confidence'], reverse=True)
        return ranked[: max(1, top_k)]
