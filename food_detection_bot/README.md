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
- `PROVIDER=max_remote` to call an IBM MAX Object Detector instance from `MAX-Object-Detector-master.zip`
- `PROVIDER=ensemble` to merge detections from multiple providers such as `yolo,max_remote`

## MAX integration

The ZIP you provided contains IBM's `MAX-Object-Detector`, which is a separate TensorFlow service. This repo now supports
using that service as an optional upstream detector instead of embedding its TensorFlow runtime into `food_detection_bot`.

Example `.env`:

```bash
PROVIDER=ensemble
ENSEMBLE_PROVIDERS=yolo,max_remote
MODEL_ID=yolo11n.pt
MAX_REMOTE_BASE_URL=http://127.0.0.1:5000
MAX_REMOTE_PREDICT_PATH=/model/predict
MAX_REMOTE_TIMEOUT_MS=12000
```

Run the MAX service separately from the ZIP contents, for example with Docker from the upstream README:

```bash
docker run -it -p 5000:5000 quay.io/codait/max-object-detector
```

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

## Detection pipeline

The `/detect` flow now uses a staged product-matching pipeline:

- Detect objects first, infer `packaging_type`, and only run OCR aggressively for OCR-friendly packaging such as cans, bottles, cartons, wrappers, and pouches.
- Run OCR on targeted crop regions rather than the whole frame by default, with multi-rotation OCR handled inside the text providers.
- Extract structured OCR fields such as brand hints, product-name hints, `volume_ml`, `abv`, `kcal`, and zero-sugar signals.
- Generate candidates from OCR tokens, brand hints, packaging, and visual labels, then re-rank them with evidence scoring and consistency penalties.
- Return `top_match`, `alternatives`, and debug evidence so ambiguous matches are visible instead of being forced into one hard result.

## Dataset logging

Logged scan records now keep more training-oriented metadata:

- Detection-side analysis such as `packaging_type`, `ocr_strategy`, candidate counts, filtered non-food counts, and structured OCR fields.
- Feedback-side quality signals such as `frontVisibilityScore`, blur/glare/brightness, low-label-visibility flags, and failure tags like `specular_glare`, `motion_or_focus_blur`, `hard_negative_non_food`, and `wrong_product_match`.
- A derived `training_priority` so hard negatives and wrong matches can be mined first for retraining.
- An `active_learning` block per record so only low-confidence, disagreement-heavy, open-set, or user-corrected cases need to be labeled first.
