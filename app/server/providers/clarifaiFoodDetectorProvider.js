import { FoodDetectorProvider } from './foodDetectorProvider.js';

export class ClarifaiFoodDetectorProvider extends FoodDetectorProvider {
  constructor(opts = {}) {
    super();
    this.pat = opts.pat ?? process.env.CLARIFAI_PAT;
    this.userId = opts.userId ?? process.env.CLARIFAI_USER_ID;
    this.appId = opts.appId ?? process.env.CLARIFAI_APP_ID;
    this.modelId = opts.modelId ?? process.env.CLARIFAI_MODEL_ID ?? 'food-item-recognition';
    this.apiBase = opts.apiBase ?? process.env.CLARIFAI_API_BASE ?? 'https://api.clarifai.com/v2';
  }

  async detectFood(imageBytes, options = {}) {
    if (!this.pat) {
      throw new Error('Missing CLARIFAI_PAT');
    }
    if (!this.userId) {
      throw new Error('Missing CLARIFAI_USER_ID');
    }
    if (!this.appId) {
      throw new Error('Missing CLARIFAI_APP_ID');
    }

    const endpoint = `${this.apiBase}/models/${encodeURIComponent(this.modelId)}/outputs`;
    const body = {
      user_app_id: {
        user_id: this.userId,
        app_id: this.appId,
      },
      inputs: [
        {
          data: {
            image: {
              base64: imageBytes.toString('base64'),
            },
          },
        },
      ],
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.pat}`,
        'Content-Type': 'application/json',
        ...(options.scanRequestId ? { 'X-Scan-Request-Id': options.scanRequestId } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Clarifai request failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    const concepts = data?.outputs?.[0]?.data?.concepts ?? [];

    return concepts
      .filter((concept) => concept && typeof concept.name === 'string' && typeof concept.value === 'number')
      .map((concept) => ({
        name: concept.name,
        confidence: concept.value,
      }));
  }
}
