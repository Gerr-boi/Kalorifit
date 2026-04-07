from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    provider: str = 'dummy'
    ensemble_providers: str = 'yolo,max_remote'
    ensemble_dedup_iou: float = 0.55
    model_id: str = 'yolo11n.pt'
    max_remote_base_url: str = 'http://127.0.0.1:5000'
    max_remote_predict_path: str = '/model/predict'
    max_remote_timeout_ms: int = 12000
    max_remote_threshold: float | None = None
    conf_threshold: float = 0.35
    top_k: int = 5
    text_detection_enabled: bool = True
    text_provider: str = 'paddleocr'
    text_conf_threshold: float = 0.0
    package_class_name: str = 'package'
    fallback_crop_max_area_ratio: float = 0.9
    fallback_crop_min_confidence: float = 0.15
    fallback_crop_preferred_labels: str = ''
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
