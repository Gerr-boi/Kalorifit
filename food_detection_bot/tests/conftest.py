import importlib
from pathlib import Path

import pytest

from src.config import get_settings


@pytest.fixture
def isolated_dataset_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    dataset_dir = tmp_path / 'dataset'
    monkeypatch.setenv('DATASET_DIR', str(dataset_dir))
    get_settings.cache_clear()
    return dataset_dir


@pytest.fixture
def isolated_app_main(isolated_dataset_dir: Path):
    get_settings.cache_clear()
    import src.main as main_module

    main_module = importlib.reload(main_module)
    return main_module
