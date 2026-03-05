export type ScanApiPrediction = { label: string; confidence: number };

export type AdaptiveRankingRule = {
  canonical: string;
  itemId: string;
  penalty?: number;
  boost?: number;
};

export type AdaptiveRankingSnapshot = {
  enabled: boolean;
  killSwitch: boolean;
  generatedAt: string | null;
  maxPenaltyPerBrand: number;
  maxBoostPerBrand: number;
  doNotPrefer: AdaptiveRankingRule[];
  boosts: AdaptiveRankingRule[];
};

export type ScanApiDetectResult = {
  label: string;
  confidence: number;
  predictions: ScanApiPrediction[];
  scanLogId: string | null;
  isDummyProvider: boolean;
  needsRecapture: boolean;
  retryGuidance: string | null;
  topMatch: {
    name: string;
    brand: string;
    productName: string;
    confidence: number;
  } | null;
  alternatives: Array<{
    name: string;
    brand: string;
    productName: string;
    confidence: number;
  }>;
  topMatchConfidence: number | null;
  topMatchMargin: number | null;
  packagingType: string | null;
  ocrStrategy: string | null;
};

type ScanTraceLike<TStage extends string = string> = {
  scanRequestId: string;
  deviceInfo: string;
  mark: (stage: TStage, data?: Record<string, unknown>) => void;
};

type DetectFoodOptions<TStage extends string> = {
  url: string;
  trace: ScanTraceLike<TStage>;
  mode: string;
  maxWaitMs: number;
  sourceBlob?: Blob;
  externalSignal?: AbortSignal;
  isInvalidVisionLabel: (label: string) => boolean;
};

type PredictDishOptions<TStage extends string> = {
  url: string;
  trace: Pick<ScanTraceLike<TStage>, 'scanRequestId'>;
  sourceBlob?: Blob;
  externalSignal?: AbortSignal;
};

function parseJsonResponse(text: string, contentType: string, status: number): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const snippet = text.slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`Invalid API response (HTTP ${status}, ${contentType}): ${snippet}`);
  }
}

export async function fetchAdaptiveRankingSnapshot(): Promise<AdaptiveRankingSnapshot | null> {
  try {
    const response = await fetch('/api/scan-ranking-rules', { method: 'GET' });
    if (!response.ok) return null;
    const payload = await response.json();
    const rules = payload?.rules && typeof payload.rules === 'object' ? payload.rules : {};
    const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {};
    return {
      enabled: meta.rulesEnabled === true,
      killSwitch: meta.killSwitch === true,
      generatedAt: typeof meta.generatedAt === 'string' ? meta.generatedAt : null,
      maxPenaltyPerBrand:
        typeof rules.maxPenaltyPerBrand === 'number' ? Math.max(0, Math.min(0.6, rules.maxPenaltyPerBrand)) : 0.35,
      maxBoostPerBrand:
        typeof rules.maxBoostPerBrand === 'number' ? Math.max(0, Math.min(0.6, rules.maxBoostPerBrand)) : 0.25,
      doNotPrefer: Array.isArray(rules.doNotPrefer) ? rules.doNotPrefer : [],
      boosts: Array.isArray(rules.boosts) ? rules.boosts : [],
    };
  } catch {
    return null;
  }
}

export async function postScanFeedback(scanLogId: string, payload: unknown, scanRequestId: string): Promise<void> {
  await fetch('/api/scan-feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Scan-Request-Id': scanRequestId,
    },
    body: JSON.stringify({
      scanLogId,
      ...((payload && typeof payload === 'object') ? payload : {}),
    }),
  });
}

export async function detectFoodOnImage<TStage extends string>({
  url,
  trace,
  mode,
  maxWaitMs,
  sourceBlob,
  externalSignal,
  isInvalidVisionLabel,
}: DetectFoodOptions<TStage>): Promise<ScanApiDetectResult | null> {
  const blob = sourceBlob ?? await (await fetch(url)).blob();
  const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
  const form = new FormData();
  form.append('image', file);
  form.append('scanRequestId', trace.scanRequestId);
  form.append('deviceInfo', trace.deviceInfo);
  form.append('scanMode', mode);
  form.append('rotationDegrees', '0');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), maxWaitMs);
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  trace.mark('UPLOAD_START' as TStage, {
    uploadBytes: file.size,
  });

  let response: Response;
  try {
    response = await fetch('/api/detect-food', {
      method: 'POST',
      body: form,
      headers: {
        'X-Scan-Request-Id': trace.scanRequestId,
        'X-Device-Info': trace.deviceInfo,
        'X-Scan-Mode': mode,
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  trace.mark('UPLOAD_DONE' as TStage, {
    httpStatus: response.status,
  });

  const responseText = await response.text();
  const responseSizeBytes = new TextEncoder().encode(responseText).length;
  const contentType = response.headers.get('content-type') || 'unknown';
  trace.mark('API_RESPONSE_RECEIVED' as TStage, {
    httpStatus: response.status,
    responseSizeBytes,
    contentType,
  });

  const data = parseJsonResponse(responseText, contentType, response.status);

  if (!response.ok) {
    const parsed = data as { message?: string; error?: string };
    const snippet = responseText.slice(0, 180).replace(/\s+/g, ' ');
    const reason =
      parsed?.message ||
      parsed?.error ||
      `statusText=${response.statusText || 'n/a'} body=${snippet || '<empty>'}`;
    if (response.status === 404) {
      throw new Error('Food detection API not found (HTTP 404). Start the backend with `npm run dev` in `app`.');
    }
    throw new Error(`Food detection failed (HTTP ${response.status}): ${reason}`);
  }

  const parsed = data as {
    success?: boolean;
    model?: string;
    items?: Array<{
      name?: string;
      confidence?: number;
      brand?: string;
      product_name?: string;
      reasons?: string[];
    }>;
    top_match?: {
      name?: string;
      confidence?: number;
      brand?: string;
      product_name?: string;
    };
    alternatives?: Array<{
      name?: string;
      confidence?: number;
      brand?: string;
      product_name?: string;
    }>;
    packaging_type?: string;
    detections?: Array<{ label?: string; confidence?: number }>;
    text_detections?: Array<{ text?: string; confidence?: number }>;
    predicted_product?: string;
    debug?: Record<string, unknown>;
    scan_log_id?: string;
    meta?: { scanLogId?: string };
    message?: string;
    error?: string;
  };
  if (parsed?.success === false) {
    throw new Error(parsed?.message || parsed?.error || 'Food detection failed (invalid success payload).');
  }
  const modelId = typeof parsed?.model === 'string' ? parsed.model.toLowerCase() : '';
  const isDummyProvider = modelId.includes('dummy');

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const detections = Array.isArray(parsed?.detections) ? parsed.detections : [];
  const textDetections = Array.isArray(parsed?.text_detections) ? parsed.text_detections : [];
  const predictedProduct = typeof parsed?.predicted_product === 'string' ? parsed.predicted_product.trim() : '';

  const predictionsFromItems = items.flatMap((item) => {
    const name = (item?.name ?? '').trim();
    const brand = (item?.brand ?? '').trim();
    const productName = (item?.product_name ?? '').trim();
    const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
    const baseConfidence = typeof item?.confidence === 'number' ? item.confidence : 0;
    const reasonBoost =
      (reasons.includes('barcode_exact') ? 0.12 : 0) +
      (reasons.includes('brand_plus_product') ? 0.1 : 0) +
      (reasons.includes('product_exact') ? 0.08 : 0) +
      (reasons.includes('brand_exact') ? 0.05 : 0);
    const boosted = Math.min(0.99, Math.max(0, baseConfidence + reasonBoost));
    const candidates = [name, `${brand} ${productName}`.trim(), brand, productName].filter(
      (candidate, index, arr) => candidate && arr.indexOf(candidate) === index
    );

    return candidates.map((label) => ({
      label,
      confidence: boosted,
    }));
  });

  const predictionsFromDetections = detections.map((det) => ({
    label: det?.label ?? '',
    confidence: typeof det?.confidence === 'number' ? det.confidence : 0,
  }));

  const predictionsFromText = textDetections.flatMap((entry) => {
    const raw = (entry?.text ?? '').trim();
    const conf = typeof entry?.confidence === 'number' ? entry.confidence : 0;
    if (!raw) return [];
    const cleaned = raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return [];
    const parts = cleaned
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 3 && !isInvalidVisionLabel(token));
    const labels = [cleaned, ...parts];
    return labels.map((label) => ({
      label,
      confidence: Math.max(0.2, Math.min(0.75, conf)),
    }));
  });

  const strongestModelConfidence = Math.max(
    0.45,
    ...predictionsFromItems.map((entry) => entry.confidence),
    ...predictionsFromDetections.map((entry) => entry.confidence)
  );

  const predictionsFromCatalog = predictedProduct
    ? [{ label: predictedProduct, confidence: Math.min(0.98, strongestModelConfidence) }]
    : [];

  const mergedByLabel = new Map<string, ScanApiPrediction>();
  for (const entry of [...predictionsFromCatalog, ...predictionsFromItems, ...predictionsFromDetections, ...predictionsFromText]) {
    const normalizedLabel = entry.label.trim().toLowerCase();
    if (!normalizedLabel || entry.confidence <= 0) continue;
    const previous = mergedByLabel.get(normalizedLabel);
    if (!previous || entry.confidence > previous.confidence) {
      mergedByLabel.set(normalizedLabel, { label: entry.label.trim(), confidence: entry.confidence });
    }
  }

  const mergedPredictions = [...mergedByLabel.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  const parsedScanLogId =
    typeof parsed?.scan_log_id === 'string'
      ? parsed.scan_log_id
      : (typeof parsed?.meta?.scanLogId === 'string' ? parsed.meta.scanLogId : null);
  const debugData: Record<string, unknown> = parsed?.debug && typeof parsed.debug === 'object' ? parsed.debug : {};
  const topMatch = parsed?.top_match && typeof parsed.top_match === 'object'
    ? {
        name: String(parsed.top_match.name ?? '').trim(),
        brand: String(parsed.top_match.brand ?? '').trim(),
        productName: String(parsed.top_match.product_name ?? '').trim(),
        confidence: typeof parsed.top_match.confidence === 'number' ? parsed.top_match.confidence : 0,
      }
    : null;
  const alternatives = Array.isArray(parsed?.alternatives)
    ? parsed.alternatives
        .map((entry) => ({
          name: String(entry?.name ?? '').trim(),
          brand: String(entry?.brand ?? '').trim(),
          productName: String(entry?.product_name ?? '').trim(),
          confidence: typeof entry?.confidence === 'number' ? entry.confidence : 0,
        }))
        .filter((entry) => entry.name)
    : [];
  const dishPredictionsRaw = Array.isArray(debugData.dish_predictions)
    ? (debugData.dish_predictions as Array<{ label?: unknown; confidence?: unknown }>)
    : [];
  const predictionsFromDish = dishPredictionsRaw
    .map((entry) => ({
      label: String(entry?.label ?? '').trim(),
      confidence: typeof entry?.confidence === 'number' ? Math.max(0.25, Math.min(0.92, entry.confidence)) : 0,
    }))
    .filter((entry) => entry.label && entry.confidence > 0);

  const mergedWithDish = [...mergedPredictions, ...predictionsFromDish];
  const mergedByDishLabel = new Map<string, ScanApiPrediction>();
  for (const entry of mergedWithDish) {
    const key = entry.label.toLowerCase().trim();
    if (!key) continue;
    const prev = mergedByDishLabel.get(key);
    if (!prev || entry.confidence > prev.confidence) {
      mergedByDishLabel.set(key, entry);
    }
  }
  const finalPredictions = [...mergedByDishLabel.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  const labelResolutionState = typeof debugData.label_resolution_state === 'string' ? debugData.label_resolution_state : 'ready';
  const retryGuidance = typeof debugData.retry_guidance === 'string' ? debugData.retry_guidance : null;
  const topMatchConfidence =
    typeof debugData.top_match_confidence === 'number' ? debugData.top_match_confidence : (topMatch?.confidence ?? null);
  const topMatchMargin = typeof debugData.top_match_margin === 'number' ? debugData.top_match_margin : null;
  const ocrStrategy = typeof debugData.ocr_strategy === 'string' ? debugData.ocr_strategy : null;

  if (labelResolutionState === 'needs_recapture') {
    return {
      label: '',
      confidence: 0,
      predictions: finalPredictions,
      scanLogId: parsedScanLogId,
      isDummyProvider,
      needsRecapture: true,
      retryGuidance,
      topMatch,
      alternatives,
      topMatchConfidence,
      topMatchMargin,
      packagingType: typeof parsed?.packaging_type === 'string' ? parsed.packaging_type : null,
      ocrStrategy,
    };
  }
  if (!finalPredictions.length) return null;

  const best = finalPredictions[0];
  return {
    label: best?.label ?? '',
    confidence: typeof best?.confidence === 'number' ? best.confidence : 0,
    predictions: finalPredictions,
    scanLogId: parsedScanLogId,
    isDummyProvider,
    needsRecapture: false,
    retryGuidance: null,
    topMatch,
    alternatives,
    topMatchConfidence,
    topMatchMargin,
    packagingType: typeof parsed?.packaging_type === 'string' ? parsed.packaging_type : null,
    ocrStrategy,
  };
}

export async function predictDishOnImage<TStage extends string>({
  url,
  trace,
  sourceBlob,
  externalSignal,
}: PredictDishOptions<TStage>): Promise<{ predictions: ScanApiPrediction[]; latencyMs: number; circuitOpen: boolean }> {
  const blob = sourceBlob ?? await (await fetch(url)).blob();
  const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
  const form = new FormData();
  form.append('image', file);
  form.append('topk', '5');
  form.append('scanRequestId', trace.scanRequestId);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  const startedAt = performance.now();
  try {
    response = await fetch('/api/predict-dish', {
      method: 'POST',
      body: form,
      headers: {
        'X-Scan-Request-Id': trace.scanRequestId,
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    return { predictions: [], latencyMs: Math.round(performance.now() - startedAt), circuitOpen: false };
  }

  const parsed = await response.json() as {
    results?: Array<{ label?: string; confidence?: number }>;
    meta?: { circuitOpen?: unknown };
  };

  const predictions = Array.isArray(parsed.results)
    ? parsed.results
        .map((row) => ({
          label: String(row?.label ?? '').trim(),
          confidence: typeof row?.confidence === 'number' ? row.confidence : 0,
        }))
        .filter((entry) => entry.label && entry.confidence > 0)
    : [];

  return {
    predictions,
    latencyMs: Math.round(performance.now() - startedAt),
    circuitOpen: parsed?.meta?.circuitOpen === true,
  };
}
