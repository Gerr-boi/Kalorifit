import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def _norm(value: str) -> str:
    cleaned = re.sub(r'[^\w\s-]', ' ', str(value or '').strip().lower(), flags=re.UNICODE)
    return ' '.join(cleaned.split())


def _clean_alias(value: str) -> str:
    normalized = _norm(value)
    if len(normalized) < 3 or len(normalized) > 80:
        return ''
    if normalized.isnumeric():
        return ''
    return normalized


def _load_catalog(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        rows = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _load_records(records_dir: Path) -> list[dict]:
    rows: list[dict] = []
    if not records_dir.exists():
        return rows
    for record_path in records_dir.glob('*.json'):
        try:
            parsed = json.loads(record_path.read_text(encoding='utf-8'))
        except Exception:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows


def build_feedback_report(*, dataset_dir: Path, catalog_path: Path, min_alias_hits: int) -> dict:
    catalog = _load_catalog(catalog_path)
    records = _load_records(dataset_dir / 'records')

    product_aliases: dict[str, set[str]] = {}
    product_display_map: dict[str, str] = {}
    alias_to_product: dict[str, str] = {}
    for row in catalog:
        product_id = str(row.get('id') or '').strip()
        brand = str(row.get('brand') or '').strip()
        name = str(row.get('product_name') or '').strip()
        if not product_id:
            continue
        display = _norm(f'{brand} {name}')
        aliases = {_clean_alias(display), _clean_alias(_norm(name))}
        for alias in row.get('aliases', []) if isinstance(row.get('aliases'), list) else []:
            cleaned = _clean_alias(str(alias))
            if cleaned:
                aliases.add(cleaned)
        aliases.discard('')
        product_aliases[product_id] = aliases
        product_display_map[display] = product_id
        for alias in aliases:
            alias_to_product[alias] = product_id

    alias_votes: dict[str, Counter] = defaultdict(Counter)
    hard_negatives: Counter = Counter()
    corrections_seen = 0

    for record in records:
        if bool(record.get('not_food')) or bool(record.get('bad_photo')):
            continue
        corrected = _clean_alias(str(record.get('user_corrected_to') or ''))
        if not corrected:
            continue
        corrections_seen += 1
        product_id = alias_to_product.get(corrected) or product_display_map.get(corrected)
        if not product_id:
            continue

        ocr_lines: list[str] = []
        for token in record.get('ocr', []) if isinstance(record.get('ocr'), list) else []:
            cleaned = _clean_alias(str(token))
            if cleaned:
                ocr_lines.append(cleaned)
        for row in record.get('ocr_output', []) if isinstance(record.get('ocr_output'), list) else []:
            if not isinstance(row, dict):
                continue
            cleaned = _clean_alias(str(row.get('text') or ''))
            if cleaned:
                ocr_lines.append(cleaned)

        known_aliases = product_aliases.get(product_id, set())
        for candidate in ocr_lines:
            if candidate in known_aliases:
                continue
            alias_votes[product_id][candidate] += 1

        predicted = _clean_alias(str(record.get('predicted_product') or ''))
        if predicted and predicted != corrected:
            hard_negatives[f'{predicted} -> {corrected}'] += 1

    alias_suggestions: dict[str, list[dict]] = {}
    for product_id, counts in alias_votes.items():
        suggested = [
            {'alias': alias, 'hits': hits}
            for alias, hits in counts.most_common()
            if hits >= min_alias_hits
        ]
        if suggested:
            alias_suggestions[product_id] = suggested

    return {
        'dataset_dir': dataset_dir.as_posix(),
        'catalog_path': catalog_path.as_posix(),
        'records_count': len(records),
        'corrections_count': corrections_seen,
        'products_with_alias_suggestions': len(alias_suggestions),
        'alias_suggestions': alias_suggestions,
        'hard_negatives': [{'pair': pair, 'count': count} for pair, count in hard_negatives.most_common(100)],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Mine scan feedback for catalog alias suggestions.')
    parser.add_argument('--dataset-dir', default='dataset', help='Path to dataset directory containing records/.')
    parser.add_argument('--catalog', default='src/data/products.json', help='Path to product catalog JSON.')
    parser.add_argument('--min-alias-hits', type=int, default=2, help='Minimum frequency to suggest an alias.')
    parser.add_argument('--out', default='dataset/reports/feedback_alias_report.json', help='Output JSON report path.')
    args = parser.parse_args()

    report = build_feedback_report(
        dataset_dir=Path(args.dataset_dir),
        catalog_path=Path(args.catalog),
        min_alias_hits=max(1, int(args.min_alias_hits)),
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote feedback report: {out_path.as_posix()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
