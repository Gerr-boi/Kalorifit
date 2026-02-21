# KaloriFit Web App

This app now includes a production-safe MVP food detection flow:

- Frontend image upload + preview + detect button
- Backend endpoint `POST /api/detect-food`
- Provider adapter abstraction (`FoodDetectorProvider`)
- Default provider: `food_detection_bot` microservice
- Label filtering/normalization with threshold and synonym mapping

## Run locally

1. Install dependencies:
```bash
npm install
```

2. Start `food_detection_bot` (from repo root):
```bash
cd food_detection_bot
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload
```

3. Create `.env` in `app/`:
```env
FOOD_DETECTION_BOT_URL=http://127.0.0.1:8001
# Optional:
# FOOD_DETECTION_BOT_DETECT_PATH=/detect
# FOOD_DETECTION_BOT_HEALTH_PATH=/health
# FOOD_DETECTION_BOT_TIMEOUT_MS=12000
# PORT=8787
```

4. Start frontend + backend:
```bash
npm run dev
```

Frontend runs via Vite and proxies `/api/*` to the local API server.

## API

### `POST /api/detect-food`

- Content type: `multipart/form-data`
- Field name: `image`
- Supported mime types: `image/jpeg`, `image/png`, `image/webp`
- Max size: `8MB`

Response:
```json
{
  "ok": true,
  "model": "dummy-v1",
  "latency_ms": 8,
  "label": "pizza",
  "confidence": 0.91,
  "items": [
    { "name": "pizza", "confidence": 0.91, "count": 1 },
    { "name": "salad", "confidence": 0.62, "count": 1 }
  ],
  "detections": [
    { "label": "pizza", "confidence": 0.91, "bbox": [12, 35, 240, 310] }
  ],
  "meta": {
    "provider": "food_detection_bot"
  }
}
```

If no food is detected, returns:
```json
{
  "items": []
}
```

## Provider abstraction

Provider interface contract:

```ts
interface FoodDetectorProvider {
  detectFood(imageBytes: Buffer, options?: object): Promise<
    | Array<{ name: string; confidence: number }>
    | {
        ok?: boolean;
        model?: string;
        latency_ms?: number;
        items?: Array<{ name: string; confidence: number; count?: number }>;
        detections?: Array<{ label: string; confidence: number; bbox?: number[] }>;
      }
  >;
}
```

Current implementation:
- `server/providers/foodDetectionBotProvider.js`

To switch provider later:
1. Add a new provider implementing the same `detectFood` method.
2. Inject it into `createApp({ provider: yourProvider })`.
3. Keep endpoint and frontend unchanged.

## Tests

Run:
```bash
npm run test
```

Included:
- Unit test: `server/__tests__/foodLabelUtils.test.js`
  - threshold + synonym + food filtering logic
- Integration test: `server/__tests__/detectFoodEndpoint.test.js`
  - endpoint behavior with mocked provider

## Security/Privacy notes

- No model keys are used in browser code.
- Uploads are processed in memory (multer memory storage) and not persisted.

