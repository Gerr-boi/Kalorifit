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


def create_detector(settings: Settings) -> Detector:
    provider = settings.provider.strip().lower()
    if provider == 'dummy':
        from src.providers.dummy_provider import DummyProvider

        return DummyProvider(model_id='dummy-v1')
    if provider == 'yolo':
        from src.providers.yolo_provider import YoloProvider

        return YoloProvider(model_id=settings.model_id)
    raise ValueError(f'Unsupported PROVIDER={settings.provider!r}')
