from pathlib import Path
from typing import Any


class DishClassifier:
    @property
    def model_id(self) -> str:
        return 'dish-classifier-unavailable'

    def status(self) -> dict[str, Any]:
        return {'available': False, 'message': 'dish classifier unavailable'}

    def predict(self, _image, top_k: int = 5) -> list[dict[str, Any]]:
        _ = top_k
        return []


class DisabledDishClassifier(DishClassifier):
    def status(self) -> dict[str, Any]:
        return {'available': False, 'message': 'disabled by config'}


class TorchFood101DishClassifier(DishClassifier):
    def __init__(self, checkpoint_path: str):
        self._checkpoint_path = Path(checkpoint_path)
        self._available = False
        self._message: str | None = None
        self._model = None
        self._classes: list[str] = []
        self._transform = None
        self._torch = None
        self._device = None
        self._model_id = 'food101-efficientnet-b0'
        self._load()

    @property
    def model_id(self) -> str:
        return self._model_id

    def status(self) -> dict[str, Any]:
        return {'available': self._available, 'message': self._message, 'model_id': self._model_id}

    def _load(self) -> None:
        try:
            import torch
            from torch import nn
            from torchvision import models, transforms
        except Exception as exc:
            self._message = f'torch/torchvision not available: {exc}'
            return

        if not self._checkpoint_path.exists():
            self._message = f'checkpoint not found: {self._checkpoint_path.as_posix()}'
            return

        try:
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            ckpt = torch.load(self._checkpoint_path, map_location=device)
            classes = ckpt.get('classes', [])
            if not isinstance(classes, list) or not classes:
                self._message = 'checkpoint missing classes list'
                return

            model = models.efficientnet_b0(weights=None)
            model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(classes))
            model.load_state_dict(ckpt['state'])
            model.eval().to(device)

            transform = transforms.Compose(
                [
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
                ]
            )

            self._torch = torch
            self._device = device
            self._model = model
            self._classes = [str(c) for c in classes]
            self._transform = transform
            self._available = True
            self._message = None
        except Exception as exc:
            self._message = f'failed to load dish classifier: {exc}'

    def predict(self, image, top_k: int = 5) -> list[dict[str, Any]]:
        if not self._available or self._model is None or self._transform is None or self._torch is None:
            return []

        x = self._transform(image).unsqueeze(0).to(self._device)
        with self._torch.no_grad():
            logits = self._model(x)[0]
            probs = self._torch.softmax(logits, dim=0)
            values, indexes = self._torch.topk(probs, k=min(max(1, top_k), len(self._classes)))

        rows: list[dict[str, Any]] = []
        for value, index in zip(values.cpu(), indexes.cpu()):
            idx = int(index.item())
            rows.append(
                {
                    'label': self._classes[idx].replace('_', ' '),
                    'confidence': round(float(value.item()), 4),
                    'source': 'dish_classifier',
                }
            )
        return rows


def create_dish_classifier(enabled: bool, checkpoint_path: str) -> DishClassifier:
    if not enabled:
        return DisabledDishClassifier()
    return TorchFood101DishClassifier(checkpoint_path=checkpoint_path)
