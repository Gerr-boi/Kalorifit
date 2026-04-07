import httpx
from PIL import Image

from src.providers.ensemble_provider import EnsembleProvider
from src.providers.max_remote_provider import MaxRemoteProvider
from src.providers.dummy_provider import DummyProvider


def test_max_remote_provider_translates_max_payload(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/model/predict'
        return httpx.Response(
            200,
            json={
                'status': 'ok',
                'predictions': [
                    {
                        'label': 'banana',
                        'probability': 0.81,
                        'detection_box': [0.1, 0.2, 0.6, 0.7],
                    }
                ],
            },
        )

    transport = httpx.MockTransport(handler)

    class MockClient(httpx.Client):
        def __init__(self, *args, **kwargs):
            kwargs['transport'] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, 'Client', MockClient)
    provider = MaxRemoteProvider(base_url='http://max.local', threshold=0.4)

    result = provider.detect(Image.new('RGB', (200, 100), color='white'))

    assert result.model_id == 'max-object-detector'
    assert len(result.detections) == 1
    assert result.detections[0].label == 'banana'
    assert result.detections[0].bbox == [40.0, 10.0, 140.0, 60.0]


def test_ensemble_provider_deduplicates_matching_labels():
    image = Image.new('RGB', (320, 240), color='white')
    primary = DummyProvider(model_id='primary')
    secondary = DummyProvider(model_id='secondary')
    secondary.detect = lambda _image: type(primary.detect(_image))(  # type: ignore[method-assign]
        detections=[
            primary.detect(_image).detections[0],
            primary.detect(_image).detections[1],
        ],
        model_id='secondary',
        latency_ms=1,
        image_size=_image.size,
    )
    provider = EnsembleProvider([primary, secondary], dedup_iou=0.5)

    result = provider.detect(image)

    assert result.model_id == 'primary+secondary'
    assert len([row for row in result.detections if row.label == 'pizza']) == 1
