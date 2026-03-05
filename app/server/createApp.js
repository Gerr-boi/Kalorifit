import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { FoodDetectionBotProvider } from './providers/foodDetectionBotProvider.js';
import { DEFAULT_THRESHOLD, normalizeAndFilterFoodItems } from './foodLabelUtils.js';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_INFERENCE_TIME_MS = 15_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SCAN_RANKING_RULES_PATH = path.join(DATA_DIR, 'scan-ranking-rules.json');

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
    ok: false,
    error,
    message,
    meta: {
      scanRequestId,
      ...extra,
    },
  });
}

async function loadJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function defaultLoadAdaptiveRankingRules() {
  try {
    const payload = await loadJsonFile(SCAN_RANKING_RULES_PATH);
    const rules = payload && typeof payload === 'object' ? payload : {};
    return {
      rules: {
        maxPenaltyPerBrand: typeof rules.maxPenaltyPerBrand === 'number' ? rules.maxPenaltyPerBrand : 0.35,
        maxBoostPerBrand: typeof rules.maxBoostPerBrand === 'number' ? rules.maxBoostPerBrand : 0.25,
        doNotPrefer: Array.isArray(rules.doNotPrefer) ? rules.doNotPrefer : [],
        boosts: Array.isArray(rules.boosts) ? rules.boosts : [],
      },
      meta: {
        rulesEnabled: true,
        killSwitch: rules.killSwitchDefault === true,
        generatedAt: typeof rules.generatedAt === 'string' ? rules.generatedAt : null,
        windowDays: typeof rules.windowDays === 'number' ? rules.windowDays : null,
        source: typeof rules.source === 'string' ? rules.source : 'scan-ranking-rules',
        stats: rules.stats && typeof rules.stats === 'object' ? rules.stats : {},
      },
    };
  } catch {
    return {
      rules: {
        maxPenaltyPerBrand: 0.35,
        maxBoostPerBrand: 0.25,
        doNotPrefer: [],
        boosts: [],
      },
      meta: {
        rulesEnabled: false,
        killSwitch: false,
        generatedAt: null,
        source: 'scan-ranking-rules',
        stats: {},
      },
    };
  }
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

function normalizeDetectionPayload(rawPayload, threshold) {
  if (Array.isArray(rawPayload)) {
    const items = normalizeAndFilterFoodItems(rawPayload, threshold);
    return {
      ok: true,
      model: null,
      latency_ms: null,
      items,
      detections: [],
      debug: null,
    };
  }

  const payload = typeof rawPayload === 'object' && rawPayload ? rawPayload : {};
  const incomingItems = Array.isArray(payload.items) ? payload.items : [];
  const incomingDetections = Array.isArray(payload.detections) ? payload.detections : [];
  const incomingTextDetections = Array.isArray(payload.text_detections) ? payload.text_detections : [];

  const items =
    incomingItems.length > 0
      ? incomingItems
          .filter((item) => item && typeof item.name === 'string' && typeof item.confidence === 'number')
          .map((item) => ({
            name: item.name,
            confidence: item.confidence,
            ...(typeof item.count === 'number' ? { count: item.count } : {}),
          }))
      : normalizeAndFilterFoodItems(
          incomingDetections
            .filter((detection) => detection && typeof detection.label === 'string' && typeof detection.confidence === 'number')
            .map((detection) => ({
              name: detection.label,
              confidence: detection.confidence,
            })),
          threshold
        );

  const detections = incomingDetections
    .filter((detection) => detection && typeof detection.label === 'string' && typeof detection.confidence === 'number')
    .map((detection) => ({
      label: detection.label,
      confidence: detection.confidence,
      ...(Array.isArray(detection.bbox) ? { bbox: detection.bbox } : {}),
    }));

  return {
    ok: payload.ok !== false,
    model: typeof payload.model === 'string' ? payload.model : typeof payload.model_id === 'string' ? payload.model_id : null,
    latency_ms: typeof payload.latency_ms === 'number' ? payload.latency_ms : null,
    scan_log_id: typeof payload.scan_log_id === 'string' ? payload.scan_log_id : null,
    barcode_result: typeof payload.barcode_result === 'string' ? payload.barcode_result : null,
    predicted_product: typeof payload.predicted_product === 'string' ? payload.predicted_product : null,
    packaging_type: typeof payload.packaging_type === 'string' ? payload.packaging_type : null,
    package_detection:
      payload.package_detection &&
      typeof payload.package_detection === 'object' &&
      typeof payload.package_detection.label === 'string'
        ? {
            label: payload.package_detection.label,
            confidence:
              typeof payload.package_detection.confidence === 'number' ? payload.package_detection.confidence : 0,
            ...(Array.isArray(payload.package_detection.bbox) ? { bbox: payload.package_detection.bbox } : {}),
          }
        : null,
    top_match:
      payload.top_match &&
      typeof payload.top_match === 'object' &&
      typeof payload.top_match.name === 'string'
        ? {
            name: payload.top_match.name,
            ...(typeof payload.top_match.product_id === 'string' ? { product_id: payload.top_match.product_id } : {}),
            ...(typeof payload.top_match.brand === 'string' ? { brand: payload.top_match.brand } : {}),
            ...(typeof payload.top_match.product_name === 'string'
              ? { product_name: payload.top_match.product_name }
              : {}),
            ...(typeof payload.top_match.confidence === 'number' ? { confidence: payload.top_match.confidence } : {}),
            ...(Array.isArray(payload.top_match.reasons) ? { reasons: payload.top_match.reasons } : {}),
            ...(payload.top_match.evidence && typeof payload.top_match.evidence === 'object'
              ? { evidence: payload.top_match.evidence }
              : {}),
          }
        : null,
    alternatives: Array.isArray(payload.alternatives)
      ? payload.alternatives
          .filter((item) => item && typeof item.name === 'string')
          .map((item) => ({
            name: item.name,
            ...(typeof item.product_id === 'string' ? { product_id: item.product_id } : {}),
            ...(typeof item.brand === 'string' ? { brand: item.brand } : {}),
            ...(typeof item.product_name === 'string' ? { product_name: item.product_name } : {}),
            ...(typeof item.confidence === 'number' ? { confidence: item.confidence } : {}),
            ...(Array.isArray(item.reasons) ? { reasons: item.reasons } : {}),
            ...(item.evidence && typeof item.evidence === 'object' ? { evidence: item.evidence } : {}),
          }))
      : [],
    items,
    detections,
    text_detections: incomingTextDetections
      .filter((entry) => entry && typeof entry.text === 'string')
      .map((entry) => ({
        text: entry.text,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0,
        ...(Array.isArray(entry.bbox) ? { bbox: entry.bbox } : {}),
      })),
    debug: payload.debug && typeof payload.debug === 'object' ? payload.debug : null,
  };
}

export function createApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  const provider = options.provider ?? new FoodDetectionBotProvider(options.foodDetectionBot ?? {});
  const threshold = typeof options.threshold === 'number' ? options.threshold : DEFAULT_THRESHOLD;
  const loadAdaptiveRankingRules =
    typeof options.loadAdaptiveRankingRules === 'function' ? options.loadAdaptiveRankingRules : defaultLoadAdaptiveRankingRules;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
  });

  app.get('/api/health', async (_req, res) => {
    const providerHealth = typeof provider.health === 'function' ? await provider.health() : null;
    res.json({
      ok: true,
      provider: 'food_detection_bot',
      bot: providerHealth,
    });
  });

  app.get('/api/scan-ranking-rules', async (_req, res) => {
    const payload = await loadAdaptiveRankingRules();
    return res.json(payload);
  });

  app.post('/api/detect-food', upload.single('image'), async (req, res) => {
    const scanRequestId = req.get('x-scan-request-id') || req.body?.scanRequestId || createRequestId();
    const deviceInfo = req.get('x-device-info') || req.body?.deviceInfo || null;
    const scanMode = req.get('x-scan-mode') || req.body?.scanMode || 'photo';
    const rotationRaw = req.body?.rotationDegrees;
    const parsedRotation = Number.parseInt(rotationRaw, 10);
    const rotationDegrees = Number.isFinite(parsedRotation) ? parsedRotation : null;
    const barcode = req.body?.barcode || null;
    const logStage = stageLogger(scanRequestId, {
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      deviceInfo,
      scanMode,
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
          mimeType: detectedMimeType,
          filename: file.originalname,
          context: {
            scan_mode: scanMode,
            device_info: deviceInfo,
            rotation_degrees: rotationDegrees,
            barcode,
          },
        }),
        MAX_INFERENCE_TIME_MS,
        inferenceAbort
      );
      logStage('INFERENCE_END', {
        hasPayload: Boolean(rawItems),
      });

      logStage('POSTPROCESS_START');
      const detectionPayload = normalizeDetectionPayload(rawItems, threshold);
      const items = detectionPayload.items;
      logStage('POSTPROCESS_END', {
        itemCount: items.length,
      });

      const best = items[0] ?? null;
      const payload = {
        success: true,
        ok: detectionPayload.ok,
        model: detectionPayload.model,
        latency_ms: detectionPayload.latency_ms,
        scan_log_id: detectionPayload.scan_log_id,
        barcode_result: detectionPayload.barcode_result,
        predicted_product: detectionPayload.predicted_product,
        packaging_type: detectionPayload.packaging_type,
        package_detection: detectionPayload.package_detection,
        top_match: detectionPayload.top_match,
        alternatives: detectionPayload.alternatives,
        label: best?.name ?? null,
        confidence: best?.confidence ?? null,
        boxes: detectionPayload.detections
          .filter((entry) => Array.isArray(entry.bbox))
          .map((entry) => entry.bbox),
        items,
        detections: detectionPayload.detections,
        text_detections: detectionPayload.text_detections,
        debug: detectionPayload.debug,
        meta: {
          scanRequestId,
          modelVersion: detectionPayload.model ?? provider.modelId ?? null,
          provider: 'food_detection_bot',
          scanLogId: detectionPayload.scan_log_id,
        },
      };

      logStage('RESPONSE_SENT', {
        httpStatus: 200,
        responseItemCount: items.length,
      });
      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const configMatch = message.match(/^FOOD_DETECTION_BOT_CONFIGURATION_ERROR:\s*(.*)$/s);
      if (configMatch) {
        logStage('UPSTREAM_CONFIGURATION_ERROR', { message: configMatch[1] });
        return sendError(
          res,
          502,
          scanRequestId,
          'FOOD_DETECTION_BOT_CONFIGURATION_ERROR',
          configMatch[1]
        );
      }
      if (message === 'INFERENCE_TIMEOUT' || message === 'FOOD_DETECTION_BOT_TIMEOUT') {
        logStage('INFERENCE_TIMEOUT');
        return sendError(
          res,
          504,
          scanRequestId,
          'INFERENCE_TIMEOUT',
          'Model inference exceeded the time limit.'
        );
      }
      const botMatch = message.match(/Food detection bot request failed \((\d+)\):\s*(.*)/s);
      if (botMatch) {
        const upstreamStatus = Number(botMatch[1]);
        const upstreamBody = botMatch[2]?.slice(0, 600) ?? '';
        logStage('UPSTREAM_ERROR', {
          upstreamStatus,
          upstreamBody,
        });

        if (upstreamStatus === 401 || upstreamStatus === 403) {
          return sendError(
            res,
            502,
            scanRequestId,
            'FOOD_DETECTION_BOT_AUTH_FAILED',
            'Food detection bot authentication failed.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus === 404) {
          return sendError(
            res,
            502,
            scanRequestId,
            'FOOD_DETECTION_BOT_NOT_FOUND',
            'Food detection bot endpoint not found. Verify FOOD_DETECTION_BOT_URL and route configuration.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus === 429) {
          return sendError(
            res,
            502,
            scanRequestId,
            'FOOD_DETECTION_BOT_RATE_LIMITED',
            'Food detection bot rate limit reached. Retry in a moment.',
            { upstreamStatus }
          );
        }
        if (upstreamStatus >= 500) {
          return sendError(
            res,
            502,
            scanRequestId,
            'FOOD_DETECTION_BOT_UPSTREAM_ERROR',
            'Food detection bot service is temporarily unavailable.',
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
          'FOOD_DETECTION_BOT_NETWORK_ERROR',
          'Could not reach the food detection bot. Check bot process, URL, and network settings.'
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

  app.post('/api/predict-dish', upload.single('image'), async (req, res) => {
    const scanRequestId = req.get('x-scan-request-id') || req.body?.scanRequestId || createRequestId();

    try {
      const file = req.file;
      if (!file) {
        return sendError(res, 400, scanRequestId, 'MISSING_IMAGE', 'Missing image upload (field name: image)');
      }
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        return sendError(res, 400, scanRequestId, 'INVALID_FILE_TYPE', 'Invalid file type. Use jpg/png/webp.');
      }
      const detectedMimeType = detectImageType(file.buffer);
      if (!detectedMimeType) {
        return sendError(res, 400, scanRequestId, 'IMAGE_DECODE_FAILED', 'Could not decode image.');
      }

      const predictionAbort = new AbortController();
      const topk = Number.parseInt(req.body?.topk, 10);
      const upstream = await withTimeout(
        provider.predictDish(file.buffer, {
          signal: predictionAbort.signal,
          scanRequestId,
          mimeType: detectedMimeType,
          filename: file.originalname,
          topk: Number.isFinite(topk) ? topk : 5,
          context: {
            scanRequestId,
          },
        }),
        MAX_INFERENCE_TIME_MS,
        predictionAbort
      );

      const results = Array.isArray(upstream?.results)
        ? upstream.results
            .filter((row) => row && typeof row.label === 'string')
            .map((row) => ({
              label: row.label,
              confidence: typeof row.confidence === 'number' ? row.confidence : 0,
              ...(typeof row.source === 'string' ? { source: row.source } : {}),
            }))
        : [];

      return res.json({
        ok: upstream?.ok !== false,
        model: typeof upstream?.model === 'string' ? upstream.model : null,
        results,
        meta: {
          scanRequestId,
          provider: 'food_detection_bot',
          circuitOpen: upstream?.meta?.circuitOpen === true,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const configMatch = message.match(/^FOOD_DETECTION_BOT_CONFIGURATION_ERROR:\s*(.*)$/s);
      if (configMatch) {
        return sendError(
          res,
          502,
          scanRequestId,
          'FOOD_DETECTION_BOT_CONFIGURATION_ERROR',
          configMatch[1]
        );
      }
      if (message === 'INFERENCE_TIMEOUT' || message === 'FOOD_DETECTION_BOT_TIMEOUT') {
        return sendError(res, 504, scanRequestId, 'INFERENCE_TIMEOUT', 'Model inference exceeded the time limit.');
      }
      const botMatch = message.match(/Food detection bot request failed \((\d+)\):\s*(.*)/s);
      if (botMatch) {
        const upstreamStatus = Number(botMatch[1]);
        if (upstreamStatus === 404) {
          return sendError(
            res,
            502,
            scanRequestId,
            'FOOD_DETECTION_BOT_NOT_FOUND',
            'Food detection bot endpoint not found. Verify FOOD_DETECTION_BOT_URL and route configuration.'
          );
        }
      }
      return sendError(
        res,
        502,
        scanRequestId,
        'DISH_PREDICTION_UNAVAILABLE',
        `Dish prediction unavailable: ${message.slice(0, 240)}`
      );
    }
  });

  app.post('/api/scan-feedback', async (req, res) => {
    const scanRequestId = req.get('x-scan-request-id') || req.body?.scanRequestId || createRequestId();
    const scanLogId = typeof req.body?.scanLogId === 'string' ? req.body.scanLogId.trim() : '';
    if (!scanLogId) {
      return sendError(res, 400, scanRequestId, 'MISSING_SCAN_LOG_ID', 'Missing scanLogId.');
    }

    try {
      const payload = {
        scan_log_id: scanLogId,
        ...(typeof req.body?.userConfirmed === 'boolean' ? { user_confirmed: req.body.userConfirmed } : {}),
        ...(typeof req.body?.userCorrectedTo === 'string' ? { user_corrected_to: req.body.userCorrectedTo } : {}),
        ...(typeof req.body?.notFood === 'boolean' ? { not_food: req.body.notFood } : {}),
        ...(typeof req.body?.badPhoto === 'boolean' ? { bad_photo: req.body.badPhoto } : {}),
        ...(typeof req.body?.feedbackNotes === 'string' ? { feedback_notes: req.body.feedbackNotes } : {}),
        ...(req.body?.correctedDetection &&
        typeof req.body.correctedDetection === 'object' &&
        (
          typeof req.body.correctedDetection.label === 'string' ||
          (Array.isArray(req.body.correctedDetection.bbox) && req.body.correctedDetection.bbox.length === 4)
        )
          ? {
              corrected_detection: {
                ...(typeof req.body.correctedDetection.label === 'string'
                  ? { label: req.body.correctedDetection.label }
                  : {}),
                ...(Array.isArray(req.body.correctedDetection.bbox) ? { bbox: req.body.correctedDetection.bbox } : {}),
              },
            }
          : {}),
        ...(req.body?.feedbackContext && typeof req.body.feedbackContext === 'object' ? { feedback_context: req.body.feedbackContext } : {}),
      };
      const upstream = await provider.submitFeedback(payload, { scanRequestId });
      return res.json({
        ok: true,
        ...upstream,
        meta: {
          scanRequestId,
          provider: 'food_detection_bot',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const botMatch = message.match(/Food detection bot request failed \((\d+)\):\s*(.*)/s);
      if (botMatch) {
        const upstreamStatus = Number(botMatch[1]);
        if (upstreamStatus === 404) {
          return sendError(res, 404, scanRequestId, 'SCAN_LOG_NOT_FOUND', 'Scan log not found.');
        }
      }
      return sendError(res, 502, scanRequestId, 'SCAN_FEEDBACK_FAILED', `Could not save feedback: ${message.slice(0, 240)}`);
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
