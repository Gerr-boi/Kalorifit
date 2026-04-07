import json

from src.core.product_catalog import ProductCatalog


def _write_catalog(tmp_path, rows):
    path = tmp_path / 'products.json'
    path.write_text(json.dumps(rows), encoding='utf-8')
    return path


def test_brand_plus_product_beats_generic_token_match(tmp_path):
    path = _write_catalog(
        tmp_path,
        [
            {
                'id': 'coke-zero',
                'brand': 'Coca-Cola',
                'product_name': 'Zero Sugar',
                'aliases': ['coca cola zero', 'coke zero'],
                'barcode': None,
                'keywords': ['cola', 'soda'],
            },
            {
                'id': 'generic-cola',
                'brand': 'Generic',
                'product_name': 'Cola Drink',
                'aliases': ['cola drink'],
                'barcode': None,
                'keywords': ['cola', 'drink'],
            },
        ],
    )
    catalog = ProductCatalog(str(path))
    ranked = catalog.rank_candidates(ocr_lines=['coca cola zero sugar'], barcode=None, top_k=2)
    assert ranked
    assert ranked[0]['product_id'] == 'coke-zero'
    assert 'brand_plus_product' in ranked[0]['reasons']


def test_generic_without_brand_gets_penalized(tmp_path):
    path = _write_catalog(
        tmp_path,
        [
            {
                'id': 'cola-brand',
                'brand': 'Coca-Cola',
                'product_name': 'Original',
                'aliases': ['coca cola'],
                'barcode': None,
                'keywords': ['cola'],
            }
        ],
    )
    catalog = ProductCatalog(str(path))
    ranked = catalog.rank_candidates(ocr_lines=['soda drink bottle'], barcode=None, top_k=2)
    assert ranked == []


def test_barcode_exact_is_hard_winner(tmp_path):
    path = _write_catalog(
        tmp_path,
        [
            {
                'id': 'p1',
                'brand': 'BrandA',
                'product_name': 'DrinkA',
                'aliases': [],
                'barcode': '1234567890123',
                'keywords': [],
            },
            {
                'id': 'p2',
                'brand': 'BrandB',
                'product_name': 'DrinkB',
                'aliases': ['brand b'],
                'barcode': None,
                'keywords': ['drink'],
            },
        ],
    )
    catalog = ProductCatalog(str(path))
    ranked = catalog.rank_candidates(ocr_lines=['random text'], barcode='1234567890123', top_k=2)
    assert ranked
    assert ranked[0]['product_id'] == 'p1'
    assert ranked[0]['confidence'] == 1.0
    assert ranked[0]['reasons'] == ['barcode_exact']
