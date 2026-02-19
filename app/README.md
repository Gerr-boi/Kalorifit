# KaloriFit Web App

This app now includes a production-safe MVP food detection flow:

- Frontend image upload + preview + detect button
- Backend endpoint `POST /api/detect-food`
- Provider adapter abstraction (`FoodDetectorProvider`)
- Default provider: Clarifai
- Label filtering/normalization with threshold and synonym mapping

## Run locally

1. Install dependencies:
```bash
npm install
```

2. Create `.env` in `app/`:
```env
CLARIFAI_PAT=your_pat_here
# Optional:
# CLARIFAI_MODEL_ID=food-item-recognition
# CLARIFAI_API_BASE=https://api.clarifai.com/v2
# PORT=8787
```

3. Start frontend + backend:
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
  "items": [
    { "name": "pizza", "confidence": 0.92 },
    { "name": "salad", "confidence": 0.81 }
  ]
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
  detectFood(imageBytes: Buffer): Promise<Array<{ name: string; confidence: number }>>;
}
```

Current implementation:
- `server/providers/clarifaiFoodDetectorProvider.js`

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

- No provider API keys are used in browser code.
- API keys are read from server env vars only.
- Uploads are processed in memory (multer memory storage) and not persisted.

