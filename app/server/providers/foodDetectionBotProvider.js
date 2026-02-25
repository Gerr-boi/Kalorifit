import { FoodDetectorProvider } from './foodDetectorProvider.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8001';
const DEFAULT_DETECT_PATH = '/detect';
const DEFAULT_PREDICT_DISH_PATH = '/predict-dish';
const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_FEEDBACK_PATH = '/feedback';
const DEFAULT_TIMEOUT_MS = 12_000;

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function joinUrl(baseUrl, path) {
  const normalizedBase = trimTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function toErrorBodySnippet(text, max = 600) {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function resolveConfiguredBaseUrl(opts = {}) {
  const configured = opts.baseUrl ?? process.env.FOOD_DETECTION_BOT_URL ?? DEFAULT_BASE_URL;
  const inCloudRuntime = Boolean(process.env.VERCEL || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT);

  try {
    const parsed = new URL(configured);
    if (inCloudRuntime && isLocalHostname(parsed.hostname)) {
      throw new Error(
        `FOOD_DETECTION_BOT_CONFIG_ERROR: FOOD_DETECTION_BOT_URL points to ${parsed.hostname}, which is only reachable locally. Set FOOD_DETECTION_BOT_URL to a public bot endpoint.`
      );
    }
    return configured;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('FOOD_DETECTION_BOT_CONFIG_ERROR:')) {
      throw err;
    }
    throw new Error(
      `FOOD_DETECTION_BOT_CONFIG_ERROR: Invalid FOOD_DETECTION_BOT_URL value "${String(configured)}".`
    );
  }
}

export class FoodDetectionBotProvider extends FoodDetectorProvider {
  constructor(opts = {}) {
    super();
    this.baseUrl = resolveConfiguredBaseUrl(opts);
    this.detectPath = opts.detectPath ?? process.env.FOOD_DETECTION_BOT_DETECT_PATH ?? DEFAULT_DETECT_PATH;
    this.predictDishPath = opts.predictDishPath ?? process.env.FOOD_DETECTION_BOT_PREDICT_DISH_PATH ?? DEFAULT_PREDICT_DISH_PATH;
    this.healthPath = opts.healthPath ?? process.env.FOOD_DETECTION_BOT_HEALTH_PATH ?? DEFAULT_HEALTH_PATH;
    this.feedbackPath = opts.feedbackPath ?? process.env.FOOD_DETECTION_BOT_FEEDBACK_PATH ?? DEFAULT_FEEDBACK_PATH;
    this.timeoutMs = Number(opts.timeoutMs ?? process.env.FOOD_DETECTION_BOT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.modelId = 'food_detection_bot';
  }

  async detectFood(imageBytes, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const mimeType = options.mimeType || 'image/jpeg';
    const filename = options.filename || `capture.${mimeType.split('/')[1] ?? 'jpg'}`;
    const url = joinUrl(this.baseUrl, this.detectPath);

    try {
      const form = new FormData();
      form.append('image', new Blob([imageBytes], { type: mimeType }), filename);
      if (options.context && typeof options.context === 'object') {
        const contextEntries = Object.entries(options.context).filter(([, value]) => value !== undefined && value !== null);
        for (const [key, value] of contextEntries) {
          form.append(key, String(value));
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          ...(options.scanRequestId ? { 'X-Scan-Request-Id': options.scanRequestId } : {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const parsed = contentType.includes('application/json') && text ? JSON.parse(text) : text;

      if (!response.ok) {
        throw new Error(
          `Food detection bot request failed (${response.status}): ${
            typeof parsed === 'string' ? toErrorBodySnippet(parsed) : JSON.stringify(parsed).slice(0, 600)
          }`
        );
      }

      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Food detection bot returned a non-JSON response.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('FOOD_DETECTION_BOT_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async predictDish(imageBytes, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const mimeType = options.mimeType || 'image/jpeg';
    const filename = options.filename || `capture.${mimeType.split('/')[1] ?? 'jpg'}`;
    const url = joinUrl(this.baseUrl, this.predictDishPath);

    try {
      const form = new FormData();
      form.append('image', new Blob([imageBytes], { type: mimeType }), filename);
      if (typeof options.topk === 'number' && Number.isFinite(options.topk)) {
        form.append('topk', String(Math.max(1, Math.min(10, Math.round(options.topk)))));
      }

      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          ...(options.scanRequestId ? { 'X-Scan-Request-Id': options.scanRequestId } : {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const parsed = contentType.includes('application/json') && text ? JSON.parse(text) : text;

      if (!response.ok) {
        // Fallback for bots without /predict-dish: use /detect debug payload if available.
        if (response.status === 404) {
          const detectPayload = await this.detectFood(imageBytes, options);
          const debug = detectPayload?.debug && typeof detectPayload.debug === 'object' ? detectPayload.debug : {};
          const dishPredictions = Array.isArray(debug?.dish_predictions) ? debug.dish_predictions : [];
          return {
            ok: true,
            model: detectPayload?.model ?? null,
            results: dishPredictions,
            fallback: 'detect_debug_dish_predictions',
          };
        }
        throw new Error(
          `Food detection bot request failed (${response.status}): ${
            typeof parsed === 'string' ? toErrorBodySnippet(parsed) : JSON.stringify(parsed).slice(0, 600)
          }`
        );
      }

      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Food detection bot returned a non-JSON response.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('FOOD_DETECTION_BOT_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async submitFeedback(payload, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const url = joinUrl(this.baseUrl, this.feedbackPath);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.scanRequestId ? { 'X-Scan-Request-Id': options.scanRequestId } : {}),
        },
        body: JSON.stringify(payload ?? {}),
        signal: controller.signal,
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const parsed = contentType.includes('application/json') && text ? JSON.parse(text) : text;

      if (!response.ok) {
        throw new Error(
          `Food detection bot request failed (${response.status}): ${
            typeof parsed === 'string' ? toErrorBodySnippet(parsed) : JSON.stringify(parsed).slice(0, 600)
          }`
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('FOOD_DETECTION_BOT_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async health() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_000);
    const url = joinUrl(this.baseUrl, this.healthPath);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
        };
      }
      const data = await response.json();
      return {
        ok: true,
        ...data,
      };
    } catch {
      return {
        ok: false,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
