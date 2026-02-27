from abc import ABC, abstractmethod

from src.config import Settings
from src.core.types import DetectionResult


class Detector(ABC):
    @abstractmethod
    def detect(self, image) -> DetectionResult:
        raise NotImplementedError

    @property
    @abstractmethod
    def model_id(self) -> str:
        raise NotImplementedError

    @property
    def weights_path(self) -> str | None:
        return None


def _build_detector(settings: Settings, provider: str) -> Detector:
    provider = provider.strip().lower()
    if provider == 'dummy':
        from src.providers.dummy_provider import DummyProvider

        return DummyProvider(model_id='dummy-v1')
    if provider == 'yolo':
        from src.providers.yolo_provider import YoloProvider

        return YoloProvider(model_id=settings.model_id)
    if provider == 'max_remote':
        from src.providers.max_remote_provider import MaxRemoteProvider

        return MaxRemoteProvider(
            base_url=settings.max_remote_base_url,
            predict_path=settings.max_remote_predict_path,
            timeout_ms=settings.max_remote_timeout_ms,
            threshold=settings.max_remote_threshold if settings.max_remote_threshold is not None else settings.conf_threshold,
        )
    if provider == 'ensemble':
        from src.providers.ensemble_provider import EnsembleProvider

        provider_names = [name.strip().lower() for name in settings.ensemble_providers.split(',') if name.strip()]
        nested = [_build_detector(settings, name) for name in provider_names if name != 'ensemble']
        if not nested:
            raise ValueError('PROVIDER=ensemble requires ENSEMBLE_PROVIDERS to include at least one detector.')
        return EnsembleProvider(detectors=nested, dedup_iou=settings.ensemble_dedup_iou)
    raise ValueError(f'Unsupported PROVIDER={settings.provider!r}')


def create_detector(settings: Settings) -> Detector:
    return _build_detector(settings, settings.provider)
