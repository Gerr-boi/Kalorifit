import { FoodDetectorProvider } from './foodDetectorProvider.js';
import { createScannerRuntimeError, getScannerRuntimeConfig } from '../scannerRuntimeConfig.js';

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

function formatAttemptedUrls(urls = []) {
  return urls.length ? ` Attempted: ${urls.join(', ')}` : '';
}

export class FoodDetectionBotProvider extends FoodDetectorProvider {
  constructor(opts = {}) {
    super();
    this.baseUrl = typeof opts.baseUrl === 'string' ? opts.baseUrl : null;
    this.detectPath = opts.detectPath ?? process.env.FOOD_DETECTION_BOT_DETECT_PATH ?? DEFAULT_DETECT_PATH;
    this.predictDishPath = opts.predictDishPath ?? process.env.FOOD_DETECTION_BOT_PREDICT_DISH_PATH ?? DEFAULT_PREDICT_DISH_PATH;
    this.healthPath = opts.healthPath ?? process.env.FOOD_DETECTION_BOT_HEALTH_PATH ?? DEFAULT_HEALTH_PATH;
    this.feedbackPath = opts.feedbackPath ?? process.env.FOOD_DETECTION_BOT_FEEDBACK_PATH ?? DEFAULT_FEEDBACK_PATH;
    this.timeoutMs = Number(opts.timeoutMs ?? process.env.FOOD_DETECTION_BOT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.modelId = 'food_detection_bot';
  }

  withRequestContext(request) {
    return new FoodDetectionBotProvider({
      baseUrl: this.baseUrl ?? undefined,
      detectPath: this.detectPath,
      predictDishPath: this.predictDishPath,
      healthPath: this.healthPath,
      feedbackPath: this.feedbackPath,
      timeoutMs: this.timeoutMs,
      request,
    });
  }

  getRuntimeConfig(request = null) {
    return getScannerRuntimeConfig({
      configuredUrl: this.baseUrl ?? process.env.FOOD_DETECTION_BOT_URL,
      request,
    });
  }

  validateConfiguration(request = null) {
    const runtimeConfig = this.getRuntimeConfig(request);
    if (!runtimeConfig.isValid || !runtimeConfig.baseUrl || !Array.isArray(runtimeConfig.candidates) || !runtimeConfig.candidates.length) {
      const runtimeError = createScannerRuntimeError({
        configuredUrl: this.baseUrl ?? process.env.FOOD_DETECTION_BOT_URL,
        request,
      });
      throw new Error(`FOOD_DETECTION_BOT_CONFIGURATION_ERROR: ${runtimeError.message}`);
    }
    return runtimeConfig;
  }

  async detectFood(imageBytes, options = {}) {
    const runtimeConfig = this.validateConfiguration(options.request);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const mimeType = options.mimeType || 'image/jpeg';
    const filename = options.filename || `capture.${mimeType.split('/')[1] ?? 'jpg'}`;
    try {
      const attemptedUrls = [];
      let lastError = null;

      for (const baseUrl of runtimeConfig.candidates) {
        const url = joinUrl(baseUrl, this.detectPath);
        attemptedUrls.push(url);
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
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          if (!(message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('network'))) {
            throw err;
          }
        }
      }

      if (lastError) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)} Last error: ${message}`);
      }
      throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)}`);
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
    const runtimeConfig = this.validateConfiguration(options.request);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const attemptedUrls = [];
      let lastError = null;

      for (const baseUrl of runtimeConfig.candidates) {
        const url = joinUrl(baseUrl, this.feedbackPath);
        attemptedUrls.push(url);
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
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          if (!(message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('network'))) {
            throw err;
          }
        }
      }

      if (lastError) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)} Last error: ${message}`);
      }
      throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)}`);
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
    const runtimeConfig = this.validateConfiguration(options.request);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const mimeType = options.mimeType || 'image/jpeg';
    const filename = options.filename || `capture.${mimeType.split('/')[1] ?? 'jpg'}`;
    try {
      const attemptedUrls = [];
      let lastError = null;

      for (const baseUrl of runtimeConfig.candidates) {
        const url = joinUrl(baseUrl, this.predictDishPath);
        attemptedUrls.push(url);
        try {
          const form = new FormData();
          form.append('image', new Blob([imageBytes], { type: mimeType }), filename);
          if (typeof options.topk === 'number' && Number.isFinite(options.topk)) {
            form.append('topk', String(options.topk));
          }
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
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          if (!(message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('network'))) {
            throw err;
          }
        }
      }

      if (lastError) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)} Last error: ${message}`);
      }
      throw new Error(`Food detection bot network failed.${formatAttemptedUrls(attemptedUrls)}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('FOOD_DETECTION_BOT_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async health(request = null) {
    const runtimeConfig = this.getRuntimeConfig(request);
    if (!runtimeConfig.isValid || !runtimeConfig.baseUrl) {
      return {
        ok: false,
        error: 'FOOD_DETECTION_BOT_CONFIGURATION_ERROR',
        message: runtimeConfig.issues[0] ?? 'Scanner runtime is misconfigured.',
        baseUrl: runtimeConfig.baseUrl,
        source: runtimeConfig.source,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_000);
    const url = joinUrl(runtimeConfig.baseUrl, this.healthPath);

    try {
      const attemptedUrls = [];
      for (const baseUrl of runtimeConfig.candidates) {
        const url = joinUrl(baseUrl, this.healthPath);
        attemptedUrls.push(url);
        try {
          const response = await fetch(url, {
            signal: controller.signal,
          });
          if (!response.ok) {
            continue;
          }
          const data = await response.json();
          return {
            ok: true,
            baseUrl,
            source: runtimeConfig.source,
            attemptedUrls,
            ...data,
          };
        } catch {
          // try next candidate
        }
      }
      return {
        ok: false,
        baseUrl: runtimeConfig.baseUrl,
        source: runtimeConfig.source,
        attemptedUrls,
        message: `food_detection_bot is not reachable.${formatAttemptedUrls(attemptedUrls)}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
