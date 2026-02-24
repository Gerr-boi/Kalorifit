from src.core.product_catalog import ProductCatalog


def test_rank_candidates_prefers_urge_brand_from_ocr():
    catalog = ProductCatalog('src/data/products.json')

    ranked = catalog.rank_candidates(
        ocr_lines=['urge', 'orange soda'],
        barcode=None,
        top_k=3,
    )

    assert ranked, 'Expected at least one product match for OCR line "urge".'
    top = ranked[0]
    assert top['brand'] == 'Urge'
    assert 'brand_exact' in top.get('reasons', [])


def test_rank_candidates_prefers_coca_cola_from_ocr():
    catalog = ProductCatalog('src/data/products.json')

    ranked = catalog.rank_candidates(
        ocr_lines=['coca cola', 'original taste'],
        barcode=None,
        top_k=3,
    )

    assert ranked, 'Expected at least one product match for OCR line "coca cola".'
    top = ranked[0]
    assert top['brand'] == 'Coca-Cola'
    assert 'brand_exact' in top.get('reasons', [])
