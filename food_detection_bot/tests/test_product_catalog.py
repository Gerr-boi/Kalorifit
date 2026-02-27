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
    assert any(reason.startswith('brand_') for reason in top.get('reasons', []))


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
    assert any(reason.startswith('brand_') for reason in top.get('reasons', []))


def test_rank_candidates_uses_packaging_and_zero_sugar_consistency():
    catalog = ProductCatalog('src/data/products.json')

    ranked = catalog.rank_candidates(
        ocr_lines=['coca cola', 'zero sugar', '1.5l'],
        barcode=None,
        top_k=3,
        packaging_type='bottle',
        structured_fields={
            'brand': 'coca cola',
            'product_name': 'zero sugar',
            'volume_ml': 1500,
            'sugar_free': True,
        },
        visual_hints=['bottle'],
        visual_score_by_label={'coca cola': 0.8},
    )

    assert ranked
    assert ranked[0]['product_id'] == 'coca-cola-zero-15l'
    assert ranked[0]['accepted'] is True
    assert 'sugar_match' in ranked[0]['reasons']


def test_rank_candidates_penalizes_volume_mismatch():
    catalog = ProductCatalog('src/data/products.json')

    ranked = catalog.rank_candidates(
        ocr_lines=['coca cola', 'original taste', '330 ml'],
        barcode=None,
        top_k=3,
        packaging_type='can',
        structured_fields={
            'brand': 'coca cola',
            'product_name': 'original taste',
            'volume_ml': 330,
            'sugar_free': False,
        },
    )

    assert ranked
    assert 'volume_mismatch' in ranked[0]['reasons']
