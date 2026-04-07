# Food Detection Bot

Standalone FastAPI microservice for image-to-food detection.

## Run

```bash
cd food_detection_bot
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload
```

This port is fixed unless you change it explicitly. If the app cannot reach `127.0.0.1:8001` after a reboot, the usual cause is that the bot process is not running.

Optional ML extras (dish classifier):

```bash
pip install -r requirements-ml.txt
```

## Endpoints

- `GET /health`
- `POST /detect` (`multipart/form-data`, field name: `image`)
- `POST /log-scan` (`multipart/form-data`, manual logging endpoint)
- `POST /feedback` (`application/json`, update truth labels)

`/detect` now supports two extra paths:
- Dish/meal recognition via optional Food-101 classifier (`debug.dish_predictions`).
- Packaged-food no-barcode fallback via OCR text -> Open Food Facts search.

## Dish Classifier (Food-101)

Train a checkpoint (folder layout: `data/food101/train/<class>/*.jpg`, `data/food101/val/<class>/*.jpg`):

```bash
python scripts/train_food101.py --train-dir data/food101/train --val-dir data/food101/val --epochs 3 --out src/models/food101_efficientnet.pt
```

Runtime env/config:
- `DISH_CLASSIFIER_ENABLED=true`
- `DISH_CLASSIFIER_MODEL_PATH=src/models/food101_efficientnet.pt`
- `DISH_CLASSIFIER_TOP_K=5`

If torch/checkpoint is missing, API still runs and reports classifier unavailable in debug payload.

## Feedback Mining (weekly)

Generate alias/hard-negative suggestions from `dataset/records`:

```bash
cd food_detection_bot
python -m src.utils.feedback_mining --dataset-dir dataset --catalog src/data/products.json --out dataset/reports/feedback_alias_report.json
```

## Provider modes

- `PROVIDER=dummy` for development/integration
- `PROVIDER=yolo` for real inference (requires `ultralytics` installed)

## Hosted persistence

The bot writes scan logs and feedback under `dataset/`. For hosted production, use a persistent mounted volume or disable scan logging with:

```env
ENABLE_SCAN_LOGGING=false
```

Do not expect `dataset/` writes to persist on ephemeral/serverless platforms.

## Example response

```json
{
  "ok": true,
  "model": "dummy-v1",
  "latency_ms": 9,
  "scan_log_id": "8d76f347-966f-4f98-9b80-3a0ef34f0e16",
  "items": [
    {"name": "pizza", "confidence": 0.91, "count": 1}
  ],
  "detections": [
    {"label": "pizza", "confidence": 0.91, "bbox": [12, 35, 240, 310]}
  ]
}
```
