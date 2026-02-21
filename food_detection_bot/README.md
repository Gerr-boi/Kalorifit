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

## Endpoints

- `GET /health`
- `POST /detect` (`multipart/form-data`, field name: `image`)
- `POST /log-scan` (`multipart/form-data`, manual logging endpoint)
- `POST /feedback` (`application/json`, update truth labels)

## Provider modes

- `PROVIDER=dummy` for development/integration
- `PROVIDER=yolo` for real inference (requires `ultralytics` installed)

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
