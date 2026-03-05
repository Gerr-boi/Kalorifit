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

## Training workflow

The service now stores a `training_target` in each record once the user confirms a prediction, corrects it, or marks it as non-food. That makes the logged scans exportable into trainable datasets.

If the UI sends a corrected box in `/feedback.corrected_detection.bbox`, that box is stored and used for YOLO export ahead of the model's original detection box.

### 1. Collect labeled scans

- Run the service and submit scans through `POST /detect`.
- Send human feedback through `POST /feedback`.
- Only confirmed, corrected, or `not_food=true` scans become training-ready.
- Scans marked `bad_photo=true` are excluded from export by default.

### 2. Export a dataset

From `food_detection_bot/`:

```bash
python -m src.training.export_dataset --dataset-dir dataset --output-dir training_exports/food-v1 --tasks yolo,classification
```

This produces:

- `training_exports/food-v1/yolo/` for YOLO object-detection training
- `training_exports/food-v1/classification/` for image classification training
- `training_exports/food-v1/summary.json` with class counts and split info

Audit the dataset before training:

```bash
python -m src.training.audit_dataset --dataset-dir dataset --min-per-class 50
python -m src.training.report_missing_bbox --dataset-dir dataset --limit 50 --only-label banana
python -m src.training.make_fixes_template --dataset-dir dataset --output fixes.template.json --only-label banana
python -m src.training.patch_bboxes --dataset-dir dataset --input fixes.json
```

This reports:

- training-ready records
- per-class counts for classification and detection
- number of `__non_food__` examples
- records missing labels, images, or bounding boxes
- labels below the threshold you set with `--min-per-class`
- exact scan ids that already have human labels but still need corrected boxes for YOLO
- a fast offline patch path for filling in corrected boxes from a JSON file
- a template generator so you can keep `fixes.template.json` separate from your edited `fixes.filled.json`

`patch_bboxes` accepts either:

```json
{
  "scan-id-1": [12, 10, 108, 74],
  "scan-id-2": {"label": "banana", "bbox": [4, 9, 120, 80]}
}
```

If the label is omitted, the tool reuses the record's existing human-approved label.

Suggested repair workflow:

1. Generate a template:

```bash
python -m src.training.make_fixes_template --dataset-dir dataset --output fixes.template.json --only-label banana
```

2. Copy it to an editable file:

```bash
copy fixes.template.json fixes.filled.json
```

3. Fill in bbox values in `fixes.filled.json`.

4. Patch records:

```bash
python -m src.training.patch_bboxes --dataset-dir dataset --input fixes.filled.json
```

Use `--include-bad-photos` if you intentionally want low-quality examples in the export.

### 3. Train a YOLO detector

Install Ultralytics in your training environment:

```bash
pip install ultralytics
```

Train from the exported dataset:

```bash
yolo detect train data=training_exports/food-v1/yolo/data.yaml model=yolo11n.pt epochs=80 imgsz=640 batch=16 project=training_runs name=food-v1
```

Best weights will typically be written under:

```bash
training_runs/food-v1/weights/best.pt
```

### 4. Deploy the trained weights

Point the service at the trained model:

```bash
set PROVIDER=yolo
set MODEL_ID=training_runs/food-v1/weights/best.pt
uvicorn src.main:app --host 127.0.0.1 --port 8001
```

`GET /health` will then expose the loaded weight path and SHA-256 fingerprint so you can verify the deployed model.

### Notes

- The YOLO export uses the best logged detection box as the object box and the human-confirmed product label as the class.
- The classification export copies the full image into train/val class folders and also writes a `manifest.jsonl`.
- For best results, review `dataset/records/*.json` and prioritize examples with `training_priority="high"` or `active_learning.candidate=true`.
