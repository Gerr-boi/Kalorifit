import express from 'express';
import multer from 'multer';
import { ClarifaiFoodDetectorProvider } from './providers/clarifaiFoodDetectorProvider.js';
import { DEFAULT_THRESHOLD, normalizeAndFilterFoodItems } from './foodLabelUtils.js';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_INFERENCE_TIME_MS = 15_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function createRequestId() {
  return `scan-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function detectImageType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.length >= 3 && JPEG_SIGNATURE.every((byte, index) => buffer[index] === byte)) return 'image/jpeg';
  if (buffer.length >= 4 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) return 'image/png';
  if (buffer.length < 12) return null;
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function stageLogger(scanRequestId, context = {}) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  return (stage, data = {}) => {
    const now = Date.now();
    const deltaMs = now - lastAt;
    const elapsedMs = now - startedAt;
    lastAt = now;
    console.info(
      JSON.stringify({
        source: 'detect-food',
        scanRequestId,
        stage,
        deltaMs,
        elapsedMs,
        ...context,
        ...data,
      })
    );
  };
}

function sendError(res, status, scanRequestId, error, message, extra = {}) {
  return res.status(status).json({
    success: false,
    error,
    message,
    meta: {
      scanRequestId,
      ...extra,
    },
  });
}

async function withTimeout(task, timeoutMs, signalController) {
  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        signalController.abort();
        reject(new Error('INFERENCE_TIMEOUT'));
      }, timeoutMs);
    });
    return await Promise.race([task, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createApp(options = {}) {
  const app = express();
  const provider = options.provider ?? new ClarifaiFoodDetectorProvider(options.clarifai ?? {});
  const threshold = typeof options.threshold === 'number' ? options.threshold : DEFAULT_THRESHOLD;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/detect-food', upload.single('image'), async (req, res) => {
    const scanRequestId = req.get('x-scan-request-id') || req.body?.scanRequestId || createRequestId();
    const deviceInfo = req.get('x-device-info') || req.body?.deviceInfo || null;
    const logStage = stageLogger(scanRequestId, {
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      deviceInfo,
    });

    try {
      logStage('REQUEST_RECEIVED');
      const file = req.file;
      if (!file) {
        logStage('REQUEST_INVALID', { reason: 'MISSING_IMAGE' });
        return sendError(res, 400, scanRequestId, 'MISSING_IMAGE', 'Missing image upload (field name: image)');
      }

      logStage('IMAGE_RECEIVED', {
        mimeType: file.mimetype,
        imageBytes: file.size,
      });

      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        logStage('IMAGE_DECODE_FAILED', {
          reason: 'INVALID_FILE_TYPE',
          mimeType: file.mimetype,
        });
        return sendError(res, 400, scanRequestId, 'INVALID_FILE_TYPE', 'Invalid file type. Use jpg/png/webp.');
      }

      logStage('IMAGE_DECODE_START');
      const detectedMimeType = detectImageType(file.buffer);
      if (!detectedMimeType) {
        logStage('IMAGE_DECODE_FAILED', {
          reason: 'IMAGE_DECODE_FAILED',
        });
        return sendError(res, 400, scanRequestId, 'IMAGE_DECODE_FAILED', 'Could not decode image.');
      }
      logStage('IMAGE_DECODE_SUCCESS', {
        detectedMimeType,
      });

      logStage('PREPROCESS_START');
      logStage('PREPROCESS_END', {
        preprocess: 'none',
      });

      logStage('INFERENCE_START');
      const inferenceAbort = new AbortController();
      const rawItems = await withTimeout(
        provider.detectFood(file.buffer, {
          signal: inferenceAbort.signal,
          scanRequestId,
        }),
        MAX_INFERENCE_TIME_MS,
        inferenceAbort
      );
      logStage('INFERENCE_END', {
        rawItemCount: Array.isArray(rawItems) ? rawItems.length : 0,
      });

      logStage('POSTPROCESS_START');
      const items = normalizeAndFilterFoodItems(rawItems, threshold);
      logStage('POSTPROCESS_END', {
        itemCount: items.length,
      });

      const best = items[0] ?? null;
      const payload = {
        success: true,
        label: best?.name ?? null,
        confidence: best?.confidence ?? null,
        boxes: [],
        items,
        meta: {
          scanRequestId,
          modelVersion: provider.modelId ?? null,
        },
      };

      logStage('RESPONSE_SENT', {
        httpStatus: 200,
        responseItemCount: items.length,
      });
      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'INFERENCE_TIMEOUT') {
        logStage('INFERENCE_TIMEOUT');
        return sendError(
          res,
          504,
          scanRequestId,
          'INFERENCE_TIMEOUT',
          'Model inference exceeded the time limit.'
        );
      }
      if (message.includes('Missing CLARIFAI_PAT')) {
        logStage('CONFIG_ERROR', { message });
        return sendError(
          res,
          500,
          scanRequestId,
          'CONFIG_MISSING',
          'Server missing CLARIFAI_PAT. Set it in app/.env and restart the server.'
        );
      }
      if (message.includes('Missing CLARIFAI_USER_ID') || message.includes('Missing CLARIFAI_APP_ID')) {
        logStage('CONFIG_ERROR', { message });
        return sendError(
          res,
          500,
          scanRequestId,
          'CONFIG_MISSING',
          'Server missing CLARIFAI_USER_ID and/or CLARIFAI_APP_ID. Set both in app/.env and restart the server.'
        );
      }
      const clarifaiMatch = message.match(/Clarifai request failed \((\d+)\):\s*(.*)/s);
      if (clarifaiMatch) {
        const upstreamStatus = Number(clarifaiMatch[1]);
        const upstreamBody = clarifaiMatch[2]?.slice(0, 600) ?? '';
        logStage('UPSTREAM_ERROR', {
          upstreamStatus,
          upstreamBody,
        });

        if (upstreamStatus === 401 || upstreamStatus === 403) {
          return sendError(
            res,
            502,
            scanRequestId,
            'CLARIFAI_AUTH_FAILED',
            'Clarifai authentication failed. Verify CLARIFAI_PAT in app/.env.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus === 404) {
          return sendError(
            res,
            502,
            scanRequestId,
            'CLARIFAI_MODEL_NOT_FOUND',
            'Clarifai model not found. Verify CLARIFAI_MODEL_ID.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus === 429) {
          return sendError(
            res,
            502,
            scanRequestId,
            'CLARIFAI_RATE_LIMITED',
            'Clarifai rate limit reached. Retry in a moment.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus >= 500) {
          return sendError(
            res,
            502,
            scanRequestId,
            'CLARIFAI_UPSTREAM_ERROR',
            'Clarifai service is temporarily unavailable.',
            { upstreamStatus }
          );
        }
      }
      if (message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('network')) {
        logStage('UPSTREAM_NETWORK_ERROR', { message });
        return sendError(
          res,
          502,
          scanRequestId,
          'CLARIFAI_NETWORK_ERROR',
          'Could not reach Clarifai API. Check internet/firewall/VPN settings.'
        );
      }

      console.error('detect-food error:', err);
      logStage('EXCEPTION', { message });
      return sendError(
        res,
        502,
        scanRequestId,
        'DETECTION_SERVICE_UNAVAILABLE',
        `Food detection service unavailable: ${message.slice(0, 240)}`
      );
    }
  });

  app.use((err, req, res, _next) => {
    const scanRequestId = req.get('x-scan-request-id') || req.body?.scanRequestId || createRequestId();
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, scanRequestId, 'IMAGE_TOO_LARGE', 'Image too large. Max 8MB.');
    }
    return sendError(res, 500, scanRequestId, 'UNEXPECTED_SERVER_ERROR', 'Unexpected server error.');
  });

  return app;
}
