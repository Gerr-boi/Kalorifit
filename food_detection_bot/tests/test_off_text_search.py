from src.core.off_text_search import _normalize_text, _tokens


def test_normalize_text_basic():
    assert _normalize_text('  Coca-Cola!! Zero ') == 'coca-cola zero'


def test_tokens_remove_stopwords():
    tokens = _tokens('the bottle coca cola zero drink')
    assert 'the' not in tokens
    assert 'bottle' not in tokens
    assert 'coca' in tokens
