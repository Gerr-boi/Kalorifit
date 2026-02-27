import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROMO_STOP_WORDS = {
    'new',
    'limited',
    'edition',
    'limited edition',
    'original taste',
    'since 1886',
    'recycle me',
    'pant',
    'deposit',
    'best served cold',
}
PACKAGING_HINTS = {
    'can': {'can', 'soda can', 'tin can'},
    'bottle': {'bottle', 'plastic bottle', 'glass bottle'},
    'carton': {'carton', 'box', 'tetra pak'},
    'pouch': {'pouch', 'bag', 'sachet'},
    'bowl': {'bowl', 'cup'},
    'plate': {'plate', 'dish', 'tray'},
    'wrapper': {'wrapper', 'wrap', 'packet'},
}
ZERO_HINTS = {'zero', 'sugar free', 'sukkerfri', 'light', 'max'}
REGULAR_HINTS = {'original', 'classic', 'regular'}


def _normalize_text(value: str) -> str:
    lowered = value.strip().lower()
    lowered = (
        lowered.replace('æ', 'ae')
        .replace('ø', 'o')
        .replace('å', 'a')
        .replace('0', 'o')
        .replace('|', 'l')
    )
    cleaned = re.sub(r'[^\w\s.%]', ' ', lowered, flags=re.UNICODE)
    collapsed = ' '.join(cleaned.split())
    for phrase in PROMO_STOP_WORDS:
        collapsed = collapsed.replace(phrase, ' ')
    collapsed = re.sub(r'\b([a-z]{2,})1\b', r'\1l', collapsed)
    collapsed = re.sub(r'\s+', ' ', collapsed).strip()
    return collapsed


def _tokenize(value: str) -> list[str]:
    normalized = _normalize_text(value)
    return [token for token in normalized.split(' ') if len(token) > 1]


def _extract_volume_ml(value: str) -> int | None:
    normalized = _normalize_text(value)
    match_l = re.search(r'(\d+(?:[.,]\d+)?)\s*l\b', normalized)
    if match_l:
        liters = float(match_l.group(1).replace(',', '.'))
        return int(round(liters * 1000))
    match_ml = re.search(r'(\d+(?:[.,]\d+)?)\s*ml\b', normalized)
    if match_ml:
        return int(round(float(match_ml.group(1).replace(',', '.'))))
    return None


def _extract_abv(value: str) -> float | None:
    normalized = _normalize_text(value)
    match = re.search(r'(\d+(?:[.,]\d+)?)\s*%', normalized)
    if match:
        return float(match.group(1).replace(',', '.'))
    return None


def _extract_kcal(value: str) -> int | None:
    normalized = _normalize_text(value)
    match = re.search(r'(\d{1,4})\s*kcal\b', normalized)
    if match:
        return int(match.group(1))
    return None


def _looks_zero_sugar(value: str) -> bool | None:
    normalized = _normalize_text(value)
    if any(hint in normalized for hint in ZERO_HINTS):
        return True
    if 'sugar' in normalized or 'sukker' in normalized:
        return False
    if any(hint in normalized for hint in REGULAR_HINTS):
        return False
    return None


def _normalize_packaging(value: str | None) -> str | None:
    normalized = _normalize_text(value or '')
    if not normalized:
        return None
    for packaging, aliases in PACKAGING_HINTS.items():
        if normalized == packaging or normalized in aliases:
            return packaging
    return normalized


def _fuzzy_overlap_score(text: str, phrases: list[str]) -> tuple[float, list[str]]:
    tokens = set(_tokenize(text))
    best = 0.0
    hits: list[str] = []
    for phrase in phrases:
        normalized = _normalize_text(phrase)
        if not normalized:
            continue
        if normalized in text:
            hits.append(normalized)
            best = max(best, 1.0)
            continue
        phrase_tokens = set(_tokenize(normalized))
        if not phrase_tokens:
            continue
        overlap = len(tokens & phrase_tokens) / len(phrase_tokens)
        if overlap >= 0.5:
            hits.append(normalized)
            best = max(best, overlap)
    return best, hits


@dataclass
class ProductRecord:
    product_id: str
    brand: str
    product_name: str
    aliases: list[str]
    barcode: str | None
    keywords: list[str]
    packaging: list[str]
    volume_ml: int | None
    abv: float | None
    sugar_free: bool | None
    color_hints: list[str]
    family: str | None

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
            packaging = [
                normalized
                for value in row.get('packaging', [])
                for normalized in [_normalize_packaging(str(value))]
                if normalized
            ]
            volume_ml = None
            if row.get('volume_ml') is not None:
                try:
                    volume_ml = int(row.get('volume_ml'))
                except Exception:
                    volume_ml = None
            volume_ml = volume_ml or _extract_volume_ml(product_name)
            abv = None
            if row.get('abv') is not None:
                try:
                    abv = float(row.get('abv'))
                except Exception:
                    abv = None
            abv = abv if abv is not None else _extract_abv(product_name)
            sugar_free = row.get('sugar_free')
            if sugar_free is None:
                sugar_free = _looks_zero_sugar(' '.join([brand, product_name, *aliases, *keywords]))
            color_hints = [str(value).strip().lower() for value in row.get('color_hints', []) if str(value).strip()]
            family = str(row.get('family') or '').strip() or None

            records.append(
                ProductRecord(
                    product_id=product_id,
                    brand=brand,
                    product_name=product_name,
                    aliases=aliases,
                    barcode=barcode_raw or None,
                    keywords=keywords,
                    packaging=packaging,
                    volume_ml=volume_ml,
                    abv=abv,
                    sugar_free=sugar_free if isinstance(sugar_free, bool) else None,
                    color_hints=color_hints,
                    family=family,
                )
            )
        return records

    def rank_candidates(
        self,
        *,
        ocr_lines: list[str],
        barcode: str | None,
        top_k: int = 5,
        packaging_type: str | None = None,
        visual_hints: list[str] | None = None,
        brand_hint: str | None = None,
        structured_fields: dict[str, Any] | None = None,
        visual_score_by_label: dict[str, float] | None = None,
    ) -> list[dict]:
        if not self._items:
            return []

        clean_ocr_lines = [line for line in (_normalize_text(line) for line in ocr_lines) if line]
        ocr_blob = ' '.join(clean_ocr_lines)
        barcode_norm = ''.join((barcode or '').split())
        normalized_packaging = _normalize_packaging(packaging_type)
        visual_terms = [_normalize_text(value) for value in (visual_hints or []) if _normalize_text(value)]
        visual_blob = ' '.join(visual_terms)
        brand_hint_norm = _normalize_text(brand_hint or '')
        fields = structured_fields or {}
        observed_volume_ml = fields.get('volume_ml')
        observed_abv = fields.get('abv')
        observed_sugar_free = fields.get('sugar_free')
        observed_kcal = fields.get('kcal')
        observed_brand = _normalize_text(str(fields.get('brand') or ''))
        observed_product = _normalize_text(str(fields.get('product_name') or ''))
        observed_flavor = _normalize_text(str(fields.get('flavor') or ''))

        candidates: list[ProductRecord] = []
        for item in self._items:
            searchable = ' '.join(
                _normalize_text(part)
                for part in [item.brand, item.product_name, *item.aliases, *item.keywords]
                if _normalize_text(part)
            )
            if barcode_norm and item.barcode and barcode_norm == item.barcode:
                candidates.append(item)
                continue
            if ocr_blob and (
                _normalize_text(item.brand) in ocr_blob
                or any(_normalize_text(alias) in ocr_blob for alias in item.aliases)
                or any(keyword in ocr_blob for keyword in [_normalize_text(keyword) for keyword in item.keywords])
            ):
                candidates.append(item)
                continue
            if brand_hint_norm and brand_hint_norm in searchable:
                candidates.append(item)
                continue
            if visual_blob and any(term in searchable for term in visual_terms):
                candidates.append(item)
                continue
            if normalized_packaging and normalized_packaging in item.packaging:
                candidates.append(item)

        if not candidates:
            candidates = list(self._items)

        ranked: list[dict] = []
        for item in candidates:
            score = 0.0
            reasons: list[str] = []
            evidence: dict[str, Any] = {
                'ocr_tokens': clean_ocr_lines[:12],
                'matched_fields': [],
                'packaging_type': normalized_packaging,
                'volume_ml': observed_volume_ml,
            }

            brand_norm = _normalize_text(item.brand)
            name_norm = _normalize_text(item.product_name)
            alias_norms = [_normalize_text(alias) for alias in item.aliases]
            keyword_norms = [_normalize_text(keyword) for keyword in item.keywords]

            if barcode_norm and item.barcode and barcode_norm == item.barcode:
                score += 1.2
                reasons.append('barcode_exact')
                evidence['matched_fields'].append('barcode')

            if observed_brand and brand_norm and observed_brand == brand_norm:
                score += 0.55
                reasons.append('brand_structured_exact')
                evidence['matched_fields'].append('brand')
            elif brand_norm and brand_norm in ocr_blob:
                score += 0.42
                reasons.append('brand_exact')
                evidence['matched_fields'].append('brand')
            else:
                brand_fuzzy, _ = _fuzzy_overlap_score(ocr_blob, [item.brand, *item.aliases])
                if brand_fuzzy > 0:
                    score += 0.3 * brand_fuzzy
                    reasons.append('brand_fuzzy')

            product_phrases = [item.product_name, *item.aliases]
            if observed_product and observed_product == name_norm:
                score += 0.55
                reasons.append('product_structured_exact')
                evidence['matched_fields'].append('product_name')
            else:
                exact_name_score, exact_name_hits = _fuzzy_overlap_score(ocr_blob, [item.product_name])
                alias_score, alias_hits = _fuzzy_overlap_score(ocr_blob, item.aliases)
                name_fuzzy, name_hits = _fuzzy_overlap_score(ocr_blob, product_phrases)
                if exact_name_score >= 1.0:
                    score += 0.5
                    reasons.append('product_exact')
                    evidence['matched_fields'].append('product_name')
                elif name_fuzzy > 0:
                    score += 0.36 * name_fuzzy
                    reasons.append('product_fuzzy')
                if alias_score > 0:
                    score += min(0.18, 0.18 * alias_score)
                    reasons.append('alias_match')
                if name_hits:
                    evidence['name_hits'] = list(dict.fromkeys([*exact_name_hits, *alias_hits, *name_hits]))[:4]

            if observed_flavor:
                flavor_fuzzy, _ = _fuzzy_overlap_score(observed_flavor, product_phrases + keyword_norms)
                if flavor_fuzzy > 0:
                    score += 0.18 * flavor_fuzzy
                    reasons.append('flavor_match')
                    evidence['matched_fields'].append('flavor')

            keyword_fuzzy, keyword_hits = _fuzzy_overlap_score(ocr_blob, keyword_norms)
            if keyword_fuzzy > 0:
                score += 0.12 * keyword_fuzzy
                reasons.append('keyword_match')
                evidence['keyword_hits'] = keyword_hits[:4]

            if brand_hint_norm and brand_hint_norm == brand_norm:
                score += 0.18
                reasons.append('visual_brand_hint')

            label_visual_score = 0.0
            if visual_score_by_label:
                for label, hint_score in visual_score_by_label.items():
                    normalized_label = _normalize_text(label)
                    if normalized_label and (
                        normalized_label in brand_norm
                        or normalized_label in name_norm
                        or any(normalized_label in alias for alias in alias_norms)
                    ):
                        label_visual_score = max(label_visual_score, float(hint_score))
            if label_visual_score > 0:
                score += min(0.22, label_visual_score * 0.22)
                reasons.append('visual_label_match')
                evidence['visual_similarity'] = round(label_visual_score, 4)

            if normalized_packaging and item.packaging:
                if normalized_packaging in item.packaging:
                    score += 0.14
                    reasons.append('packaging_match')
                    evidence['matched_fields'].append('packaging')
                else:
                    score -= 0.3
                    reasons.append('packaging_mismatch')

            if observed_volume_ml and item.volume_ml:
                delta = abs(int(observed_volume_ml) - int(item.volume_ml))
                if delta <= 35:
                    score += 0.2
                    reasons.append('volume_match')
                    evidence['matched_fields'].append('volume_ml')
                elif delta >= 300:
                    score -= 0.45
                    reasons.append('volume_mismatch')

            if observed_abv is not None and item.abv is not None:
                if abs(float(observed_abv) - float(item.abv)) <= 0.3:
                    score += 0.15
                    reasons.append('abv_match')
                    evidence['matched_fields'].append('abv')
                else:
                    score -= 0.15
                    reasons.append('abv_mismatch')

            if observed_sugar_free is not None and item.sugar_free is not None:
                if bool(observed_sugar_free) == bool(item.sugar_free):
                    score += 0.14
                    reasons.append('sugar_match')
                    evidence['matched_fields'].append('sugar_free')
                else:
                    score -= 0.35
                    reasons.append('sugar_mismatch')

            if observed_kcal is not None:
                evidence['kcal'] = observed_kcal

            if score <= 0:
                continue

            ranked.append(
                {
                    'product_id': item.product_id,
                    'name': item.display_name,
                    'brand': item.brand,
                    'product_name': item.product_name,
                    'confidence': round(min(1.0, max(0.0, score / 1.8)), 4),
                    'raw_score': round(score, 4),
                    'reasons': reasons,
                    'barcode': item.barcode,
                    'packaging': item.packaging[:],
                    'volume_ml': item.volume_ml,
                    'evidence': evidence,
                }
            )

        ranked.sort(key=lambda row: (row['raw_score'], row['confidence']), reverse=True)
        top = ranked[: max(1, top_k)]
        if not top:
            return []

        top_score = float(top[0]['raw_score'])
        second_score = float(top[1]['raw_score']) if len(top) > 1 else 0.0
        margin = round(top_score - second_score, 4)
        for index, row in enumerate(top):
            row['rank'] = index + 1
            row['score_margin_to_next'] = (
                margin
                if index == 0
                else round(float(row['raw_score']) - float(top[index + 1]['raw_score']), 4)
                if index + 1 < len(top)
                else float(row['raw_score'])
            )
            row['accepted'] = index == 0 and row['confidence'] >= 0.6 and margin >= 0.08
        return top
