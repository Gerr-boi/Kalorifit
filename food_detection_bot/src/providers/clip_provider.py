from src.core.detector import Detector


class ClipProvider(Detector):
    @property
    def model_id(self) -> str:
        return 'clip-not-implemented'

    def detect(self, image):
        raise NotImplementedError('ClipProvider is reserved for a future phase.')
