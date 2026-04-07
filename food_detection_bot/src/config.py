from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    provider: str = 'dummy'
    model_id: str = 'yolo11n.pt'
    conf_threshold: float = 0.35
    top_k: int = 5
    text_detection_enabled: bool = True
    text_provider: str = 'paddleocr'
    text_conf_threshold: float = 0.0
    package_class_name: str = 'package'
    fallback_crop_max_area_ratio: float = 0.9
    fallback_crop_min_confidence: float = 0.15
    fallback_crop_preferred_labels: str = ''
    max_ocr_crops: int = 4
    ocr_min_unique_tokens_for_resolve: int = 2
    ocr_avg_confidence_min: float = 0.34
    catalog_confidence_min_for_autoresolve: float = 0.44
    enable_off_text_search_fallback: bool = True
    off_text_search_top_k: int = 5
    dish_classifier_enabled: bool = True
    dish_classifier_top_k: int = 5
    dish_classifier_model_path: str = 'src/models/food101_efficientnet.pt'
    product_catalog_path: str = 'src/data/products.json'
    enable_scan_logging: bool = True
    enable_package_crop_logging: bool = True
    dataset_dir: str = 'dataset'
    max_image_bytes: int = 8 * 1024 * 1024
    host: str = '127.0.0.1'
    port: int = 8001
    log_level: str = 'INFO'
    version: str = '1.0.0'


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
