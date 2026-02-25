import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Barcode, Camera, Check, Loader2, Search, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { resolveLabelOFFWithCandidates } from '../../ai-scanner-logic/labelResolver';
import { resolveLabelMatvaretabellen } from '../../ai-scanner-logic/matvaretabellen';
import { resolveBarcode } from '../../ai-scanner-logic/nutritionResolver';
import type { MacroNutrients, NutritionResult } from '../../ai-scanner-logic/types';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { emitLocalStorageStateChanged, getActiveUserIdFromStorage, getScopedStorageKey } from '../../hooks/useLocalStorageState';
import { createEmptyDayLog, toDateKey, type DayLog, type FoodEntry, type MealId } from '../../lib/disciplineEngine';
import { generateMonthlyIdentityReport, getCurrentMonthKey } from '../../lib/identityEngine';
import FoodDetectionPanel from '../food/FoodDetectionPanel';
import {
  brandBoostFromOcrText,
  cropCenterForOCR,
  detectLikelyTextInBlob,
  getOcrPreprocessPreset,
  getOcrTextStats,
  ocrImageToLines,
  ocrImageToText,
  ocrLinesToSeeds,
  ocrTextToSeeds,
  preprocessBlobForOcr,
  rotateBlobForOcr,
  type OcrPreprocessMode,
} from './browserOcr';
import {
  confidenceBucket,
  createResolveRunGuard,
  createResolverSessionCache,
  shouldGateWrongButConfident,
  type ResolverSeedSource,
} from './scanFlowUtils';

type ScanMode = 'search' | 'photo' | 'barcode';

interface ScannedFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  image?: string;
  per100g?: MacroNutrients | null;
}

type VisualAnchor = {
  id: string;
  name: string;
  imageHash: string;
  per100g: MacroNutrients | null;
  imageUrl?: string;
  updatedAt: number;
};

type OffProductRaw = { product?: { image_url?: string } };
type VisionPrediction = { label: string; confidence: number };
type ResolverSeed = VisionPrediction & { source: ResolverSeedSource; seedIndex?: number };
type TimedOutMarker = { timedOut: true };
type OCRLine = { text: string; confidence: number };
type OCRExtractionResult = {
  seeds: VisionPrediction[];
  brandSeeds: VisionPrediction[];
  latencyMs: number;
  preprocessTried: OcrPreprocessMode[];
  preprocessChosen: OcrPreprocessMode;
  rotationTried: number[];
  rotationChosen: number;
  runCount: number;
  textCharCount: number;
  bestLineScore: number;
  seedCount: number;
  brandBoostHitCount: number;
  brandBoostCanonicals: string[];
  brandBoostUsed: boolean;
};
type ScanFeedbackPayload = {
  userConfirmed?: boolean;
  userCorrectedTo?: string | null;
  notFood?: boolean;
  badPhoto?: boolean;
  feedbackNotes?: string;
  feedbackContext?: {
    imageHash?: string | null;
    scanSessionId?: string | null;
    topPredictions?: Array<{ label: string; prob: number }>;
    selectedPrediction?: string | null;
    resolverChosenItemId?: string | null;
    resolverChosenScore?: number | null;
    resolverChosenConfidence?: number | null;
    userFinalItemId?: string | null;
    predictLatencyMs?: number | null;
    resolveLatencyMs?: number | null;
    resolverSuccessSeedIndex?: number | null;
    resolverSuccessSeedSource?: ResolverSeedSource | null;
    seedWinSource?: ResolverSeedSource | 'manual_search' | null;
    hadCorrectionTap?: boolean;
    timeToFirstCandidateMs?: number | null;
    circuitOpen?: boolean;
    ocrPreprocessTried?: OcrPreprocessMode[];
    ocrPreprocessChosen?: OcrPreprocessMode | null;
    ocrTextCharCount?: number | null;
    ocrBestLineScore?: number | null;
    ocrSeedCount?: number | null;
    ocrRotationTried?: number[];
    ocrRotationChosen?: number | null;
    ocrRunCount?: number | null;
    ocrBrandBoostHitCount?: number | null;
    ocrBrandBoostCanonicals?: string[];
    ocrBrandBoostUsed?: boolean | null;
    brandBoostWasApplied?: boolean | null;
    brandBoostWon?: boolean | null;
    brandBoostTopCanonical?: string | null;
    brandBoostResolverChosenItemId?: string | null;
    brandBoostUserFinalItemId?: string | null;
  };
};
type LabelResolveOutcome = 'matched' | 'candidates' | 'no_match' | 'error';
type ScanTraceStage =
  | 'SCAN_START'
  | 'IMAGE_CAPTURED'
  | 'PREPROCESS_DONE'
  | 'UPLOAD_START'
  | 'UPLOAD_DONE'
  | 'API_RESPONSE_RECEIVED'
  | 'RESULT_PARSED'
  | 'UI_UPDATED'
  | 'SCAN_END';
type ScanTrace = {
  scanRequestId: string;
  deviceInfo: string;
  mark: (stage: ScanTraceStage, data?: Record<string, unknown>) => void;
};
type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};
type ScanVideoConstraints = MediaTrackConstraints;
type LevelUpCelebration = {
  fromLevel: number;
  toLevel: number;
  label: string;
  currentXp: number;
  nextLevelXp: number;
};
type AddUndoSnapshot = {
  userId: string | null;
  scopedDailyLogsStorageKey: string;
  scopedLastLoggedFoodStorageKey: string;
  scopedIdentityReportsStorageKey: string;
  rawScopedLogs: string | null;
  rawLegacyLogs: string | null;
  rawScopedLastLogged: string | null;
  rawLegacyLastLogged: string | null;
  rawScopedReports: string | null;
  rawLegacyReports: string | null;
  targetDateKeyRaw: string | null;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export default function ScanScreen() {
  const { activeUserId } = useCurrentUser();
  const MAX_VISION_WAIT_MS = 30000;
  const MAX_RESOLVER_WAIT_MS = 7500;
  const MAX_TOTAL_MATCH_WAIT_MS = 26000;
  const MAX_IMAGE_DIMENSION = 1280;
  const JPEG_QUALITY = 0.82;
  const VISUAL_ANCHOR_STORAGE_KEY = 'kalorifit.visual_anchors.v1';
  const LEGACY_DAILY_LOGS_STORAGE_KEY = 'home.dailyLogs.v2';
  const LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY = 'home.lastLoggedFood.v1';
  const LEGACY_IDENTITY_REPORTS_STORAGE_KEY = 'home.identityReports.v1';
  const SCAN_TARGET_DATE_KEY_STORAGE_KEY = 'kalorifit.scanTargetDateKey.v1';
  const SCAN_DEVICE_ID_STORAGE_KEY = 'kalorifit.scanDeviceId.v1';
  const SCAN_BRAND_AVOID_STORAGE_KEY = 'kalorifit.scan.brand_avoid.v1';
  const MAX_VISUAL_ANCHORS = 40;
  const visualAnchorStorageKey = getScopedStorageKey(VISUAL_ANCHOR_STORAGE_KEY, 'user', activeUserId);
  const [mode, setMode] = useState<ScanMode>('photo');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [portionAmount, setPortionAmount] = useState<number>(100);
  const [portionUnit, setPortionUnit] = useState<'g' | 'ml'>('g');
  const [feedback, setFeedback] = useState<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<{ expiresAt: number } | null>(null);
  const [levelUpCelebration, setLevelUpCelebration] = useState<LevelUpCelebration | null>(null);
  const [showBarcodeEntry, setShowBarcodeEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualBarcodeError, setManualBarcodeError] = useState<string | null>(null);
  const [scanLogId, setScanLogId] = useState<string | null>(null);
  const [predictionOptions, setPredictionOptions] = useState<VisionPrediction[]>([]);
  const [dishPredictions, setDishPredictions] = useState<VisionPrediction[]>([]);
  const [selectedDishSeed, setSelectedDishSeed] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [manualCorrectionLabel, setManualCorrectionLabel] = useState('');
  const [correctionNotFood, setCorrectionNotFood] = useState(false);
  const [correctionBadPhoto, setCorrectionBadPhoto] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'needs_manual_label' | 'no_match'>('idle');
  const [manualLabel, setManualLabel] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<NutritionResult[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [photoCamActive, setPhotoCamActive] = useState(false);
  const [photoCamReady, setPhotoCamReady] = useState(false);
  const [photoCamError, setPhotoCamError] = useState<string | null>(null);
  const [liveScanActive, setLiveScanActive] = useState(false);
  const [liveScanReady, setLiveScanReady] = useState(false);
  const [liveScanError, setLiveScanError] = useState<string | null>(null);
  const photoVideoRef = useRef<HTMLVideoElement | null>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveDetectorRef = useRef<BarcodeDetectorLike | null>(null);
  const liveRafRef = useRef<number | null>(null);
  const detectInProgressRef = useRef(false);
  const liveScanEnabledRef = useRef(false);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const noPredictionCountRef = useRef(0);
  const liveDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const activeCameraIdRef = useRef<string | null>(null);
  const activeScanTraceRef = useRef<ScanTrace | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const barcodeInFlightRef = useRef(false);
  const lastHandledRef = useRef<{ code: string; at: number } | null>(null);
  const stableCountsRef = useRef(new Map<string, { count: number; lastAt: number }>());
  const photoStartTokenRef = useRef(0);
  const liveStartTokenRef = useRef(0);
  const lastLiveFallbackDecodeAtRef = useRef(0);
  const selectedDishSeedRef = useRef<string | null>(null);
  const latestImageHashRef = useRef<string | null>(null);
  const dishPredictionCacheRef = useRef(new Map<string, { predictions: VisionPrediction[]; latencyMs: number }>());
  const ocrSeedCacheRef = useRef(new Map<string, OCRExtractionResult>());
  const ocrUnavailableHintedRef = useRef(false);
  const ocrWeakHintedRef = useRef(false);
  const scanMetricsRef = useRef<{
    scanSessionId: string | null;
    imageHash: string | null;
    scanStartedAtMs: number | null;
    predictLatencyMs: number | null;
    resolveLatencyMs: number | null;
    resolverChosenItemId: string | null;
    resolverChosenScore: number | null;
    resolverChosenConfidence: number | null;
    resolverSuccessSeedIndex: number | null;
    resolverSuccessSeedSource: ResolverSeedSource | null;
    timeToFirstCandidateMs: number | null;
    hadCorrectionTap: boolean;
    manualSearchUsed: boolean;
    circuitOpen: boolean;
    ocrPreprocessTried: OcrPreprocessMode[];
    ocrPreprocessChosen: OcrPreprocessMode | null;
    ocrTextCharCount: number | null;
    ocrBestLineScore: number | null;
    ocrSeedCount: number | null;
    ocrRotationTried: number[];
    ocrRotationChosen: number | null;
    ocrRunCount: number | null;
    ocrBrandBoostHitCount: number | null;
    ocrBrandBoostCanonicals: string[];
    ocrBrandBoostUsed: boolean | null;
    ocrBrandBoostTopCanonical: string | null;
  }>({
    scanSessionId: null,
    imageHash: null,
    scanStartedAtMs: null,
    predictLatencyMs: null,
    resolveLatencyMs: null,
    resolverChosenItemId: null,
    resolverChosenScore: null,
    resolverChosenConfidence: null,
    resolverSuccessSeedIndex: null,
    resolverSuccessSeedSource: null,
    timeToFirstCandidateMs: null,
    hadCorrectionTap: false,
    manualSearchUsed: false,
    circuitOpen: false,
    ocrPreprocessTried: [],
    ocrPreprocessChosen: null,
    ocrTextCharCount: null,
    ocrBestLineScore: null,
    ocrSeedCount: null,
    ocrRotationTried: [],
    ocrRotationChosen: null,
    ocrRunCount: null,
    ocrBrandBoostHitCount: null,
    ocrBrandBoostCanonicals: [],
    ocrBrandBoostUsed: null,
    ocrBrandBoostTopCanonical: null,
  });
  const resolveRunGuardRef = useRef(createResolveRunGuard());
  const resolverSessionCacheRef = useRef(createResolverSessionCache());
  const addUndoRef = useRef<AddUndoSnapshot | null>(null);

  function getDeviceInfo() {
    const nav = window.navigator;
    return `${nav.platform || 'unknown'} | ${nav.userAgent}`;
  }

  function createScanRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `scan-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  function getClientDeviceId() {
    try {
      const existing = window.localStorage.getItem(SCAN_DEVICE_ID_STORAGE_KEY);
      if (existing && existing.trim()) return existing.trim();
      const next = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `dev-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      window.localStorage.setItem(SCAN_DEVICE_ID_STORAGE_KEY, next);
      return next;
    } catch {
      return 'unknown-device';
    }
  }

  function createScanTrace(input: Record<string, unknown> = {}): ScanTrace {
    const scanRequestId = createScanRequestId();
    const deviceInfo = getDeviceInfo();
    const startedAt = performance.now();
    let lastAt = startedAt;

    const mark = (stage: ScanTraceStage, data: Record<string, unknown> = {}) => {
      const now = performance.now();
      const deltaMs = Math.round(now - lastAt);
      const elapsedMs = Math.round(now - startedAt);
      lastAt = now;

      console.info('[SCAN_TRACE]', {
        scanRequestId,
        stage,
        deltaMs,
        elapsedMs,
        deviceInfo,
        ...input,
        ...data,
      });
    };

    return { scanRequestId, deviceInfo, mark };
  }

  function showFeedback(message: string, kind: 'success' | 'error' | 'info' = 'info') {
    setFeedback({ message, kind });
  }

  function beginResolveRun() {
    return resolveRunGuardRef.current.begin();
  }

  function isCurrentResolveRun(id: number) {
    return resolveRunGuardRef.current.isCurrent(id);
  }

  function markFirstCandidateShown() {
    if (scanMetricsRef.current.timeToFirstCandidateMs != null) return;
    if (scanMetricsRef.current.scanStartedAtMs == null) return;
    scanMetricsRef.current.timeToFirstCandidateMs = Math.max(
      0,
      Math.round(performance.now() - scanMetricsRef.current.scanStartedAtMs)
    );
  }

  useEffect(() => {
    selectedDishSeedRef.current = selectedDishSeed;
  }, [selectedDishSeed]);

  function normalizeAnchorId(input: string) {
    return input.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  }

  function normalizeDishLabel(label: string) {
    const synonymMap: Record<string, string> = {
      'macaroni and cheese': 'mac and cheese',
      'macaroni cheese': 'mac and cheese',
      'spaghetti bolognese': 'spaghetti bolognese',
      'french fries': 'fries',
      'caesar salad': 'caesar salad',
    };
    const normalized = label
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return synonymMap[normalized] ?? normalized;
  }

  function filterDishPredictionSeeds(rows: VisionPrediction[]) {
    const bestByLabel = new Map<string, VisionPrediction>();
    for (const row of rows) {
      const label = normalizeDishLabel(row.label);
      if (!label || row.confidence <= 0 || isInvalidVisionLabel(label)) continue;
      const prev = bestByLabel.get(label);
      if (!prev || row.confidence > prev.confidence) {
        bestByLabel.set(label, { label, confidence: row.confidence });
      }
    }
    const sorted = [...bestByLabel.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    if (!sorted.length) return [];
    const top = sorted[0];
    return sorted.filter((entry, index) => {
      if (index === 0) return true;
      if (entry.confidence >= 0.2) return true;
      return index === 1 && (top.confidence - entry.confidence) <= 0.08;
    });
  }

  function filterOCRPredictionSeeds(rows: VisionPrediction[]) {
    const deduped = new Map<string, VisionPrediction>();
    for (const row of rows) {
      const label = normalizeDishLabel(row.label);
      if (!label || row.confidence <= 0 || isInvalidVisionLabel(label)) continue;
      const prev = deduped.get(label);
      if (!prev || row.confidence > prev.confidence) {
        deduped.set(label, { label, confidence: row.confidence });
      }
    }
    return [...deduped.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
  }

  function scoreOcrLine(line: OCRLine) {
    const text = String(line.text ?? '');
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    const density = letters / Math.max(1, text.length);
    return (Math.max(0, Math.min(1, line.confidence)) * 0.6) + (density * 0.4);
  }

  function summarizeOcrQuality(lines: OCRLine[], seeds: VisionPrediction[]) {
    const textCharCount = lines
      .map((line) => (line.text.match(/\p{L}/gu) ?? []).length)
      .reduce((sum, n) => sum + n, 0);
    const scores = lines.map((line) => scoreOcrLine(line));
    const bestLineScore = scores.length ? Math.max(...scores) : 0;
    const lineScoreSum = scores.reduce((sum, score) => sum + score, 0);
    const strongLineCount = scores.filter((score) => score >= 0.62).length;
    const weak = textCharCount < 12 || strongLineCount < 1 || lineScoreSum < 1.1 || seeds.length === 0;
    return { weak, textCharCount, bestLineScore, lineScoreSum };
  }

  function buildResolverSeeds(
    visionPredictions: VisionPrediction[],
    dishSeeds: VisionPrediction[],
    ocrBrandSeeds: VisionPrediction[],
    ocrSeeds: VisionPrediction[]
  ) {
    const ordered: ResolverSeed[] = [];
    if (selectedDishSeedRef.current) {
      const normalizedSelected = normalizeDishLabel(selectedDishSeedRef.current);
      if (normalizedSelected) {
        ordered.push({ label: normalizedSelected, confidence: 1, source: 'selected_prediction' });
      }
    }
    for (const dish of dishSeeds) {
      ordered.push({
        label: normalizeDishLabel(dish.label),
        confidence: dish.confidence,
        source: 'dish_prediction',
      });
    }
    for (const ocrBrand of ocrBrandSeeds) {
      ordered.push({
        label: normalizeDishLabel(ocrBrand.label),
        confidence: ocrBrand.confidence,
        source: 'ocr_brand',
      });
    }
    for (const ocrSeed of ocrSeeds) {
      ordered.push({
        label: normalizeDishLabel(ocrSeed.label),
        confidence: ocrSeed.confidence,
        source: 'ocr_text',
      });
    }
    for (const vision of visionPredictions) {
      ordered.push({
        label: normalizeDishLabel(vision.label),
        confidence: vision.confidence,
        source: 'vision_prediction',
      });
    }

    const deduped = new Map<string, ResolverSeed>();
    for (const seed of ordered) {
      if (!seed.label) continue;
      const key = seed.label.toLowerCase().trim();
      if (!key) continue;
      const prev = deduped.get(key);
      if (!prev || seed.confidence > prev.confidence) {
        deduped.set(key, seed);
      }
    }
    return [...deduped.values()]
      .slice(0, 6)
      .map((seed, index) => ({ ...seed, seedIndex: index + 1 }));
  }

  function makeResolvedItemId(candidate: { source?: string; name?: string; brand?: string | null }) {
    const source = String(candidate.source ?? 'unknown').trim().toLowerCase();
    const name = String(candidate.name ?? '').trim().toLowerCase();
    const brand = String(candidate.brand ?? '').trim().toLowerCase();
    return `${source}:${name}:${brand}`;
  }

  function loadVisualAnchors(): VisualAnchor[] {
    try {
      const raw = window.localStorage.getItem(visualAnchorStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as VisualAnchor[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry) => entry && typeof entry.imageHash === 'string' && typeof entry.name === 'string');
    } catch {
      return [];
    }
  }

  function saveVisualAnchors(next: VisualAnchor[]) {
    try {
      window.localStorage.setItem(visualAnchorStorageKey, JSON.stringify(next.slice(0, MAX_VISUAL_ANCHORS)));
    } catch {
      // ignore localStorage failures
    }
  }

  function hammingDistanceHex(a: string, b: string) {
    if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
    let dist = 0;
    for (let i = 0; i < a.length; i += 1) {
      const av = Number.parseInt(a[i], 16);
      const bv = Number.parseInt(b[i], 16);
      if (Number.isNaN(av) || Number.isNaN(bv)) return Number.POSITIVE_INFINITY;
      const x = av ^ bv;
      dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
    }
    return dist;
  }

  async function computeDHash(blob: Blob) {
    const img = await loadImageElement(blob);
    const canvas = document.createElement('canvas');
    const w = 9;
    const h = 8;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create image hash context');
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const bits: number[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w - 1; x += 1) {
        const i = (y * w + x) * 4;
        const j = (y * w + (x + 1)) * 4;
        const left = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const right = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
        bits.push(left > right ? 1 : 0);
      }
    }
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
      const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
      hex += nibble.toString(16);
    }
    return hex;
  }

  async function storeVisualAnchorFromProduct(result: NutritionResult) {
    const imageUrl = extractImageUrl(result.raw);
    if (!imageUrl || !result?.name) return;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return;
      const blob = await response.blob();
      const imageHash = await computeDHash(blob);
      const id = normalizeAnchorId(`${result.name}|${result.brand ?? ''}`);
      const anchors = loadVisualAnchors();
      const nextEntry: VisualAnchor = {
        id,
        name: result.name,
        imageHash,
        per100g: result.per100g ?? null,
        imageUrl,
        updatedAt: Date.now(),
      };
      const deduped = [nextEntry, ...anchors.filter((entry) => entry.id !== id)];
      deduped.sort((a, b) => b.updatedAt - a.updatedAt);
      saveVisualAnchors(deduped);
    } catch {
      // ignore hashing/fetch errors
    }
  }

  function loadBrandAvoidMap() {
    try {
      const raw = window.localStorage.getItem(SCAN_BRAND_AVOID_STORAGE_KEY);
      if (!raw) return {} as Record<string, string[]>;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!key || !Array.isArray(value)) continue;
        out[key] = value
          .map((row) => String(row ?? '').trim())
          .filter((row) => row.length > 0)
          .slice(0, 30);
      }
      return out;
    } catch {
      return {} as Record<string, string[]>;
    }
  }

  function saveBrandAvoidMap(next: Record<string, string[]>) {
    try {
      window.localStorage.setItem(SCAN_BRAND_AVOID_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore localStorage failures
    }
  }

  function addBrandAvoid(canonical: string | null, productId: string | null) {
    const key = String(canonical ?? '').trim().toLowerCase();
    const value = String(productId ?? '').trim().toLowerCase();
    if (!key || !value) return;
    const map = loadBrandAvoidMap();
    const existing = map[key] ?? [];
    if (!existing.includes(value)) {
      map[key] = [value, ...existing].slice(0, 30);
      saveBrandAvoidMap(map);
    }
  }

  function getBrandAvoidSet(canonical: string | null) {
    const key = String(canonical ?? '').trim().toLowerCase();
    if (!key) return new Set<string>();
    const map = loadBrandAvoidMap();
    return new Set((map[key] ?? []).map((entry) => entry.toLowerCase()));
  }

  async function storeVisualAnchorFromCurrentImage(result: NutritionResult) {
    const currentImageUrl = prevUrlRef.current;
    if (!currentImageUrl || !result?.name) return;
    try {
      const response = await fetch(currentImageUrl);
      if (!response.ok) return;
      const blob = await response.blob();
      const imageHash = await computeDHash(blob);
      const id = normalizeAnchorId(`${result.name}|${result.brand ?? ''}`);
      const anchors = loadVisualAnchors();
      const nextEntry: VisualAnchor = {
        id,
        name: result.name,
        imageHash,
        per100g: result.per100g ?? null,
        updatedAt: Date.now(),
      };
      const deduped = [nextEntry, ...anchors.filter((entry) => entry.id !== id)];
      deduped.sort((a, b) => b.updatedAt - a.updatedAt);
      saveVisualAnchors(deduped);
    } catch {
      // ignore local visual anchor failures
    }
  }

  async function findVisualAnchorMatch(blob: Blob) {
    const anchors = loadVisualAnchors();
    if (!anchors.length) return null;
    try {
      const hash = await computeDHash(blob);
      let best: VisualAnchor | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const anchor of anchors) {
        const distance = hammingDistanceHex(hash, anchor.imageHash);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = anchor;
        }
      }
      if (!best) return null;
      if (bestDistance > 14) return null;
      return {
        anchor: best,
        distance: bestDistance,
      };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    if (!pendingUndo) return;
    const msLeft = pendingUndo.expiresAt - Date.now();
    if (msLeft <= 0) {
      setPendingUndo(null);
      addUndoRef.current = null;
      return;
    }
    const t = window.setTimeout(() => {
      setPendingUndo(null);
      addUndoRef.current = null;
    }, msLeft);
    return () => window.clearTimeout(t);
  }, [pendingUndo]);

  useEffect(() => {
    if (!levelUpCelebration) return;
    const t = window.setTimeout(() => setLevelUpCelebration(null), 3800);
    return () => window.clearTimeout(t);
  }, [levelUpCelebration]);

  const handleScan = async () => {
     if (mode === 'photo') {
       await capturePhotoAndAnalyze();
     }
     if (mode === 'barcode') {
       setManualBarcode('');
       setManualBarcodeError(null);
       setShowBarcodeEntry(true);
     }
     if (mode === 'search') {
       const label = searchQuery.trim();
       if (!label) {
         showFeedback('Skriv inn et matnavn for å søke.', 'info');
         return;
       }
       scanMetricsRef.current.manualSearchUsed = true;
      const run = beginResolveRun();
      const outcome = await resolveLabelToScannedFood(label, run.id);
       if (outcome === 'no_match') {
         showFeedback('Fant ingen treff. Prøv et annet navn.', 'error');
       } else if (outcome === 'error') {
         showFeedback('Søket feilet. Prøv igjen.', 'error');
       }
     }
   };

  function clearScan() {
    setScannedFood(null);
    setScanLogId(null);
    setSubmittingConfirm(false);
    setPredictionOptions([]);
    setDishPredictions([]);
    setSelectedDishSeed(null);
    setShowCorrectionModal(false);
    setManualCorrectionLabel('');
    setCorrectionBadPhoto(false);
    setCorrectionNotFood(false);
    latestImageHashRef.current = null;
  }

  async function sendScanFeedback(payload: ScanFeedbackPayload) {
    if (!scanLogId) return;
    const topPredictions = dishPredictions.slice(0, 5).map((entry) => ({
      label: entry.label,
      prob: Number(entry.confidence.toFixed(4)),
    }));
    const inferredFinalId = payload.userCorrectedTo
      ? `user:${payload.userCorrectedTo.trim().toLowerCase()}`
      : (scannedFood ? makeResolvedItemId({ source: 'resolved', name: scannedFood.name, brand: '' }) : null);
    try {
      await fetch('/api/scan-feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Scan-Request-Id': activeScanTraceRef.current?.scanRequestId ?? createScanRequestId(),
        },
        body: JSON.stringify({
          scanLogId,
          ...payload,
          feedbackContext: {
            imageHash: latestImageHashRef.current,
            scanSessionId: scanMetricsRef.current.scanSessionId,
            topPredictions,
            selectedPrediction: selectedDishSeedRef.current,
            resolverChosenItemId: scanMetricsRef.current.resolverChosenItemId,
            resolverChosenScore: scanMetricsRef.current.resolverChosenScore,
            resolverChosenConfidence: scanMetricsRef.current.resolverChosenConfidence,
            userFinalItemId: payload.feedbackContext?.userFinalItemId ?? inferredFinalId,
            predictLatencyMs: scanMetricsRef.current.predictLatencyMs,
            resolveLatencyMs: scanMetricsRef.current.resolveLatencyMs,
            resolverSuccessSeedIndex: scanMetricsRef.current.resolverSuccessSeedIndex,
            resolverSuccessSeedSource: scanMetricsRef.current.resolverSuccessSeedSource,
            seedWinSource:
              scanMetricsRef.current.resolverSuccessSeedSource ??
              (scanMetricsRef.current.manualSearchUsed ? 'manual_search' : null),
            hadCorrectionTap: scanMetricsRef.current.hadCorrectionTap,
            timeToFirstCandidateMs: scanMetricsRef.current.timeToFirstCandidateMs,
            circuitOpen: scanMetricsRef.current.circuitOpen,
            ocrPreprocessTried: scanMetricsRef.current.ocrPreprocessTried,
            ocrPreprocessChosen: scanMetricsRef.current.ocrPreprocessChosen,
            ocrTextCharCount: scanMetricsRef.current.ocrTextCharCount,
            ocrBestLineScore: scanMetricsRef.current.ocrBestLineScore,
            ocrSeedCount: scanMetricsRef.current.ocrSeedCount,
            ocrRotationTried: scanMetricsRef.current.ocrRotationTried,
            ocrRotationChosen: scanMetricsRef.current.ocrRotationChosen,
            ocrRunCount: scanMetricsRef.current.ocrRunCount,
            ocrBrandBoostHitCount: scanMetricsRef.current.ocrBrandBoostHitCount,
            ocrBrandBoostCanonicals: scanMetricsRef.current.ocrBrandBoostCanonicals,
            ocrBrandBoostUsed: scanMetricsRef.current.ocrBrandBoostUsed,
            brandBoostWasApplied: scanMetricsRef.current.ocrBrandBoostUsed,
            brandBoostWon: scanMetricsRef.current.resolverSuccessSeedSource === 'ocr_brand',
            brandBoostTopCanonical: scanMetricsRef.current.ocrBrandBoostTopCanonical,
            brandBoostResolverChosenItemId: scanMetricsRef.current.resolverChosenItemId,
            brandBoostUserFinalItemId: payload.feedbackContext?.userFinalItemId ?? inferredFinalId,
            ...(payload.feedbackContext ?? {}),
          },
        }),
      });
    } catch (err) {
      console.warn('Failed to submit scan feedback:', err);
    }
  }

  const confirmCurrentPrediction = async () => {
    if (!scanLogId || !scannedFood) return;
    setSubmittingConfirm(true);
    await sendScanFeedback({
      userConfirmed: true,
      userCorrectedTo: scannedFood.name ?? null,
      feedbackContext: {
        userFinalItemId: makeResolvedItemId({ source: 'confirmed', name: scannedFood.name, brand: '' }),
      },
    });
    setSubmittingConfirm(false);
    showFeedback('Takk! Bekreftelsen er lagret.', 'success');
  };

  const undoLastAddToLog = () => {
    const snapshot = addUndoRef.current;
    if (!snapshot) return;
    try {
      const restore = (key: string, value: string | null) => {
        if (value === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, value);
        }
      };
      restore(snapshot.scopedDailyLogsStorageKey, snapshot.rawScopedLogs);
      restore(LEGACY_DAILY_LOGS_STORAGE_KEY, snapshot.rawLegacyLogs);
      restore(snapshot.scopedLastLoggedFoodStorageKey, snapshot.rawScopedLastLogged);
      restore(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY, snapshot.rawLegacyLastLogged);
      restore(snapshot.scopedIdentityReportsStorageKey, snapshot.rawScopedReports);
      restore(LEGACY_IDENTITY_REPORTS_STORAGE_KEY, snapshot.rawLegacyReports);

      if (snapshot.targetDateKeyRaw) {
        window.sessionStorage.setItem(SCAN_TARGET_DATE_KEY_STORAGE_KEY, snapshot.targetDateKeyRaw);
      } else {
        window.sessionStorage.removeItem(SCAN_TARGET_DATE_KEY_STORAGE_KEY);
      }
      emitLocalStorageStateChanged(LEGACY_DAILY_LOGS_STORAGE_KEY, { scope: 'user', userId: snapshot.userId ?? undefined });
      emitLocalStorageStateChanged(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY, { scope: 'user', userId: snapshot.userId ?? undefined });
      showFeedback('Endring angret.', 'info');
    } catch {
      showFeedback('Kunne ikke angre endringen.', 'error');
    } finally {
      setPendingUndo(null);
      addUndoRef.current = null;
    }
  };

  const addToLog = async () => {
    if (!scannedFood) return;
    const amount = Number.isFinite(portionAmount) && portionAmount > 0 ? portionAmount : 100;
    const factor = amount / 100;
    const loggedEntry: FoodEntry = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `food-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: amount !== 100 ? `${scannedFood.name} (${amount}${portionUnit})` : scannedFood.name,
      kcal: Math.round((scannedFood.per100g?.kcal ?? scannedFood.calories ?? 0) * factor),
      protein: Math.round((scannedFood.per100g?.protein_g ?? scannedFood.protein ?? 0) * factor * 10) / 10,
      carbs: Math.round((scannedFood.per100g?.carbs_g ?? scannedFood.carbs ?? 0) * factor * 10) / 10,
      fat: Math.round((scannedFood.per100g?.fat_g ?? scannedFood.fat ?? 0) * factor * 10) / 10,
    };
    const mealId: MealId = (() => {
      const hour = new Date().getHours();
      if (hour < 11) return 'breakfast';
      if (hour < 16) return 'lunch';
      if (hour < 21) return 'dinner';
      return 'snacks';
    })();
    const mealLabel: Record<MealId, string> = {
      breakfast: 'frokost',
      lunch: 'lunsj',
      dinner: 'middag',
      snacks: 'snacks',
    };

    try {
      const now = new Date();
      const activeUserIdFromStorage = getActiveUserIdFromStorage();
      const scopedDailyLogsStorageKey = getScopedStorageKey(LEGACY_DAILY_LOGS_STORAGE_KEY, 'user', activeUserIdFromStorage);
      const scopedLastLoggedFoodStorageKey = getScopedStorageKey(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY, 'user', activeUserIdFromStorage);
      const scopedIdentityReportsStorageKey = getScopedStorageKey(LEGACY_IDENTITY_REPORTS_STORAGE_KEY, 'user', activeUserIdFromStorage);
      const targetDateKeyRaw = window.sessionStorage.getItem(SCAN_TARGET_DATE_KEY_STORAGE_KEY);
      const targetDateKey = targetDateKeyRaw && /^\d{4}-\d{2}-\d{2}$/.test(targetDateKeyRaw)
        ? targetDateKeyRaw
        : toDateKey(now);

      const rawScopedLogs = window.localStorage.getItem(scopedDailyLogsStorageKey);
      const rawLegacyLogs = window.localStorage.getItem(LEGACY_DAILY_LOGS_STORAGE_KEY);
      const rawScopedLastLogged = window.localStorage.getItem(scopedLastLoggedFoodStorageKey);
      const rawLegacyLastLogged = window.localStorage.getItem(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY);
      const rawScopedReports = window.localStorage.getItem(scopedIdentityReportsStorageKey);
      const rawLegacyReports = window.localStorage.getItem(LEGACY_IDENTITY_REPORTS_STORAGE_KEY);
      const parsedScopedLogs = rawScopedLogs ? (JSON.parse(rawScopedLogs) as Record<string, DayLog>) : {};
      const parsedLegacyLogs = rawLegacyLogs ? (JSON.parse(rawLegacyLogs) as Record<string, DayLog>) : {};
      const parsed = Object.keys(parsedScopedLogs).length > 0 ? parsedScopedLogs : parsedLegacyLogs;
      const levelBefore = generateMonthlyIdentityReport(parsed, now).level;
      const dayLog = parsed[targetDateKey] ?? createEmptyDayLog();
      const nextDayLog: DayLog = {
        meals: {
          breakfast: [...(dayLog.meals?.breakfast ?? [])],
          lunch: [...(dayLog.meals?.lunch ?? [])],
          dinner: [...(dayLog.meals?.dinner ?? [])],
          snacks: [...(dayLog.meals?.snacks ?? [])],
        },
        trainingKcal: Number(dayLog.trainingKcal ?? 0),
        waterMl: Number(dayLog.waterMl ?? 0),
      };
      nextDayLog.meals[mealId].push(loggedEntry);
      const nextLogs = { ...parsed, [targetDateKey]: nextDayLog };
      try {
        window.localStorage.setItem(scopedDailyLogsStorageKey, JSON.stringify(nextLogs));
        window.localStorage.setItem(LEGACY_DAILY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
        window.localStorage.setItem(scopedLastLoggedFoodStorageKey, JSON.stringify(loggedEntry));
        window.localStorage.setItem(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY, JSON.stringify(loggedEntry));
      } catch {
        // ignore storage sync failures
      }
      emitLocalStorageStateChanged(LEGACY_DAILY_LOGS_STORAGE_KEY, { scope: 'user', userId: activeUserIdFromStorage });
      emitLocalStorageStateChanged(LEGACY_LAST_LOGGED_FOOD_STORAGE_KEY, { scope: 'user', userId: activeUserIdFromStorage });
      addUndoRef.current = {
        userId: activeUserIdFromStorage,
        scopedDailyLogsStorageKey,
        scopedLastLoggedFoodStorageKey,
        scopedIdentityReportsStorageKey,
        rawScopedLogs,
        rawLegacyLogs,
        rawScopedLastLogged,
        rawLegacyLastLogged,
        rawScopedReports,
        rawLegacyReports,
        targetDateKeyRaw,
      };

      const levelAfter = generateMonthlyIdentityReport(nextLogs, now).level;
      if (levelAfter.value > levelBefore.value) {
        setLevelUpCelebration({
          fromLevel: levelBefore.value,
          toLevel: levelAfter.value,
          label: levelAfter.label,
          currentXp: levelAfter.currentXp,
          nextLevelXp: levelAfter.nextLevelXp,
        });
      }

      try {
        const monthKey = getCurrentMonthKey(now);
        const rawScopedReports = window.localStorage.getItem(scopedIdentityReportsStorageKey);
        const rawLegacyReports = window.localStorage.getItem(LEGACY_IDENTITY_REPORTS_STORAGE_KEY);
        const parsedScopedReports = rawScopedReports ? (JSON.parse(rawScopedReports) as Record<string, unknown>) : {};
        const parsedLegacyReports = rawLegacyReports ? (JSON.parse(rawLegacyReports) as Record<string, unknown>) : {};
        const parsedReports = Object.keys(parsedScopedReports).length > 0 ? parsedScopedReports : parsedLegacyReports;
        const nextReports = {
          ...parsedReports,
          [monthKey]: generateMonthlyIdentityReport(nextLogs, now),
        };
        window.localStorage.setItem(scopedIdentityReportsStorageKey, JSON.stringify(nextReports));
        window.localStorage.setItem(LEGACY_IDENTITY_REPORTS_STORAGE_KEY, JSON.stringify(nextReports));
      } catch {
        // ignore identity report persistence failures
      }

      window.sessionStorage.removeItem(SCAN_TARGET_DATE_KEY_STORAGE_KEY);
    } catch (err) {
      console.error('Failed to save scan to daily log:', err);
      showFeedback('Kunne ikke lagre i dagboken. Prøv igjen.', 'error');
      return;
    }

    await sendScanFeedback({
      userConfirmed: true,
      userCorrectedTo: scannedFood.name ?? null,
    });
    showFeedback(`${scannedFood.name} lagt til i ${mealLabel[mealId]}.`, 'success');
    setPendingUndo({ expiresAt: Date.now() + 7000 });
    clearScan();
  };

  // Camera roll / file picker support
  const openCameraRoll = () => {
    fileInputRef.current?.click();
  };

function normalizeBarcode(code: string) {
  return code.replace(/[^\d]/g, '').trim();
}

function hasValidChecksum(code: string) {
  if (!/^\d+$/.test(code)) return false;
  const payload = code.slice(0, -1).split('').map(Number);
  const expected = Number(code[code.length - 1]);

  if (code.length === 13) {
    const sum = payload.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
    const check = (10 - (sum % 10)) % 10;
    return check === expected;
  }

  if (code.length === 12) {
    const sum = payload.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    return check === expected;
  }

  if (code.length === 8) {
    const sum = payload.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    return check === expected;
  }

  // GTIN-14 and other numeric product variants are allowed without strict checksum.
  return true;
}

function isLikelyProductBarcode(code: string) {
  if (!/^\d{8,14}$/.test(code)) return false;
  return hasValidChecksum(code);
}

function shouldHandleBarcode(code: string) {
  const now = Date.now();
  const normalized = normalizeBarcode(code);
  if (!normalized) return null;
  if (!isLikelyProductBarcode(normalized)) return null;

  // Cooldown: ignore exact same code within 2500ms
  const last = lastHandledRef.current;
  if (last && last.code === normalized && now - last.at < 2500) return null;

  // Stability: require 2 hits in ~1.8s (better distance tolerance while keeping noise down)
  const m = stableCountsRef.current;
  const prev = m.get(normalized);
  const next = !prev || now - prev.lastAt > 1800
    ? { count: 1, lastAt: now }
    : { count: prev.count + 1, lastAt: now };

  m.set(normalized, next);

  if (next.count < 2) return null;

  // reset counter once accepted
  m.delete(normalized);
  return normalized;
}

function stopLiveBarcodeScan() {
  liveStartTokenRef.current += 1;
  liveScanEnabledRef.current = false;
  if (liveRafRef.current !== null) {
    window.cancelAnimationFrame(liveRafRef.current);
    liveRafRef.current = null;
  }

  if (liveStreamRef.current) {
    liveStreamRef.current.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
  }

  if (liveVideoRef.current) {
    try {
      liveVideoRef.current.pause();
    } catch {
      // ignore pause errors
    }
    liveVideoRef.current.srcObject = null;
  }

  if (zxingControlsRef.current) {
    zxingControlsRef.current.stop();
    zxingControlsRef.current = null;
  }
  liveDetectorRef.current = null;

  detectInProgressRef.current = false;
  lastLiveFallbackDecodeAtRef.current = 0;
  setLiveScanReady(false);
  setLiveScanActive(false);
}

function stopPhotoCamera() {
  photoStartTokenRef.current += 1;
  if (photoStreamRef.current) {
    photoStreamRef.current.getTracks().forEach((track) => track.stop());
    photoStreamRef.current = null;
  }

  if (photoVideoRef.current) {
    try {
      photoVideoRef.current.pause();
    } catch {
      // ignore pause errors
    }
    photoVideoRef.current.srcObject = null;
  }

  setPhotoCamReady(false);
  setPhotoCamActive(false);
}

async function startPhotoCamera(preferredDeviceId?: string) {
  if (photoCamActive) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setPhotoCamError('Kamera er ikke tilgjengelig i denne nettleseren.');
    return;
  }

  const startToken = ++photoStartTokenRef.current;
  try {
    setPhotoCamError(null);
    setPhotoCamReady(false);
    let stream: MediaStream | null = null;
    const cameraHints: ScanVideoConstraints[] = [];

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const sortedVideoInputs = [...videoInputs].sort((a, b) => {
        const aFront = /front|facetime|webcam|integrated|user/i.test(a.label);
        const bFront = /front|facetime|webcam|integrated|user/i.test(b.label);
        if (aFront === bFront) return 0;
        return aFront ? -1 : 1;
      });
      liveDevicesRef.current = sortedVideoInputs;

      const selected =
        preferredDeviceId
          ? sortedVideoInputs.find((d) => d.deviceId === preferredDeviceId)
          : sortedVideoInputs[0];
      if (selected?.deviceId) {
        cameraHints.push({ deviceId: { exact: selected.deviceId } });
      }
    } catch {
      // device listing may fail before permission; fallback below still works
    }

    cameraHints.push({ facingMode: { ideal: 'user' } });
    cameraHints.push({ facingMode: { ideal: 'environment' } });

    for (const hint of cameraHints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: hint,
          audio: false,
        });
        break;
      } catch {
        // try next hint
      }
    }

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    if (photoStartTokenRef.current !== startToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    photoStreamRef.current = stream;
    const activeTrack = stream.getVideoTracks()[0];
    const activeSettings = activeTrack?.getSettings();
    if (activeSettings?.deviceId) {
      activeCameraIdRef.current = activeSettings.deviceId;
    }

    const video = photoVideoRef.current;
    if (!video) {
      setPhotoCamError('Kameravisning er ikke klar ennå.');
      stopPhotoCamera();
      return;
    }
    video.srcObject = stream;
    await video.play();
    if (photoStartTokenRef.current !== startToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    setPhotoCamReady(true);
    setPhotoCamActive(true);
  } catch (err) {
    if (photoStartTokenRef.current !== startToken) return;
    console.error('Failed to start photo camera:', err);
    setPhotoCamError('Kunne ikke starte kamera. Sjekk kameratillatelse.');
    stopPhotoCamera();
  }
}

async function scanLoop() {
  const video = liveVideoRef.current;
  const detector = liveDetectorRef.current;

  if (!video || !liveScanEnabledRef.current) return;

  if (!detectInProgressRef.current && video.readyState >= 2) {
    detectInProgressRef.current = true;
    try {
      let matched = false;
      if (detector) {
        const results = await detector.detect(video);
        for (const result of results ?? []) {
          const rawValue = result?.rawValue;
          if (!rawValue) continue;
          const handled = await handleBarcodeDetected(rawValue, true);
          if (handled) {
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        const now = Date.now();
        if (now - lastLiveFallbackDecodeAtRef.current >= 850) {
          lastLiveFallbackDecodeAtRef.current = now;
          const fallbackCode = await tryDecodeBarcodeFromVideo(video);
          if (fallbackCode) {
            await handleBarcodeDetected(fallbackCode, true);
          }
        }
      }
    } catch {
      // ignore intermittent detector errors while streaming
    } finally {
      detectInProgressRef.current = false;
    }
  }

  liveRafRef.current = window.requestAnimationFrame(scanLoop);
}

async function startLiveBarcodeScan(preferredDeviceId?: string) {
  if (liveScanActive) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setLiveScanError('Kamera er ikke tilgjengelig i denne nettleseren.');
    return;
  }

  const startToken = ++liveStartTokenRef.current;
  try {
    setLiveScanError(null);
    setLiveScanReady(false);
    liveDetectorRef.current = window.BarcodeDetector
      ? new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128', 'code_39', 'codabar'],
        })
      : null;

    let stream: MediaStream | null = null;
    const cameraHints: ScanVideoConstraints[] = [];

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const sortedVideoInputs = [...videoInputs].sort((a, b) => {
        const aBack = /back|rear|environment/i.test(a.label);
        const bBack = /back|rear|environment/i.test(b.label);
        if (aBack === bBack) return 0;
        return aBack ? -1 : 1;
      });
      liveDevicesRef.current = sortedVideoInputs;

      const selected =
        preferredDeviceId
          ? sortedVideoInputs.find((d) => d.deviceId === preferredDeviceId)
          : sortedVideoInputs[0];

      if (selected?.deviceId) {
        cameraHints.push({ deviceId: { exact: selected.deviceId } });
      }
    } catch {
      // device listing may fail before permission; fallback below still works
    }

    cameraHints.push({
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
    });
    cameraHints.push({
      facingMode: { ideal: 'user' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
    });

    for (const hint of cameraHints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: hint,
          audio: false,
        });
        break;
      } catch {
        // try next hint
      }
    }

    if (!stream) {
      // Final fallback for desktops/browsers that reject specific constraints.
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    if (liveStartTokenRef.current !== startToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    liveStreamRef.current = stream;
    const activeTrack = stream.getVideoTracks()[0];
    const activeSettings = activeTrack?.getSettings();
    if (activeTrack?.applyConstraints) {
      activeTrack
        .applyConstraints({
          advanced: [
            { focusMode: 'continuous' } as unknown as MediaTrackConstraintSet,
            { exposureMode: 'continuous' } as unknown as MediaTrackConstraintSet,
            { whiteBalanceMode: 'continuous' } as unknown as MediaTrackConstraintSet,
          ] as MediaTrackConstraintSet[],
        })
        .catch(() => {
          // best-effort camera tuning; browser/device support varies
        });
    }
    if (activeSettings?.deviceId) {
      activeCameraIdRef.current = activeSettings.deviceId;
    }

    const video = liveVideoRef.current;
    if (!video) {
      setLiveScanError('Kameravisning er ikke klar ennå.');
      stopLiveBarcodeScan();
      return;
    }
    video.srcObject = stream;
    await video.play();
    if (liveStartTokenRef.current !== startToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    setLiveScanReady(true);
    if (!liveDetectorRef.current) {
      setLiveScanError('Kamera aktiv. Bruker JS-skanner fallback for desktop/nettleser.');
    }
    liveScanEnabledRef.current = true;
    setLiveScanActive(true);
    liveRafRef.current = window.requestAnimationFrame(scanLoop);
  } catch (err) {
    if (liveStartTokenRef.current !== startToken) return;
    console.error('Failed to start live barcode scan:', err);
    setLiveScanError('Kunne ikke starte kamera. Sjekk kameratillatelse.');
    stopLiveBarcodeScan();
  }
}

async function handleBarcodeDetected(rawCode: string, requireStableRead = true) {
  const code = requireStableRead ? shouldHandleBarcode(rawCode) : normalizeBarcode(rawCode);
  if (!code) {
    if (!requireStableRead) setManualBarcodeError('Ugyldig strekkode.');
    return false;
  }

  if (barcodeInFlightRef.current) return false;
  barcodeInFlightRef.current = true;

  try {
    setIsScanning(true);
    setScanState("idle");

    const result = await resolveBarcode(code);
    if (!result) {
      showFeedback("Fant ingen produkt for strekkoden. Prov foto eller manuelt sok.", 'error');
      return false;
    }

    setScannedFood({
      name: result.name,
      calories: result.per100g?.kcal || 0,
      protein: result.per100g?.protein_g || 0,
      carbs: result.per100g?.carbs_g || 0,
      fat: result.per100g?.fat_g || 0,
      per100g: result.per100g ?? null,
      confidence: Math.round(result.confidence * 100),
      image: extractImageUrl(result.raw),
    });
    setScanLogId(null);
    setPredictionOptions([]);
    void storeVisualAnchorFromProduct(result);
    stopLiveBarcodeScan();

    lastHandledRef.current = { code, at: Date.now() };
    return true;
  } catch (e) {
    console.error("Barcode flow failed:", e);
    showFeedback("Strekkodeoppslag feilet. Sjekk nettverk og prov igjen.", 'error');
    return false;
  } finally {
    setIsScanning(false);
    barcodeInFlightRef.current = false;
  }
}

async function rotateBlob(blob: Blob, degrees: 0 | 90 | 180 | 270): Promise<Blob> {
  if (degrees === 0) return blob;
  const img = await loadImageElement(blob);
  const srcW = img.naturalWidth || 1;
  const srcH = img.naturalHeight || 1;
  const canvas = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  canvas.width = swap ? srcH : srcW;
  canvas.height = swap ? srcW : srcH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2);
  const out = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
  });
  return out ?? blob;
}

async function decodeWithBarcodeDetector(blob: Blob): Promise<string | null> {
  try {
    if (!window.BarcodeDetector) return null;
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128', 'code_39', 'codabar'],
    });
    const bitmap = await createImageBitmap(blob);
    try {
      const results = await detector.detect(bitmap);
      const raw = results?.[0]?.rawValue ? normalizeBarcode(results[0].rawValue) : '';
      if (raw && isLikelyProductBarcode(raw)) return raw;
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

async function decodeWithZXing(blob: Blob): Promise<string | null> {
  try {
    if (!zxingReaderRef.current) {
      zxingReaderRef.current = new BrowserMultiFormatReader();
    }
    const url = URL.createObjectURL(blob);
    try {
      const result = await zxingReaderRef.current.decodeFromImageUrl(url);
      const raw = normalizeBarcode(result?.getText?.() ?? '');
      if (raw && isLikelyProductBarcode(raw)) return raw;
      return null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

async function tryDecodeBarcodeFromBlob(blob: Blob, fastMode = false): Promise<string | null> {
  const angles: Array<0 | 90 | 180 | 270> = fastMode ? [0, 180] : [0, 90, 180, 270];
  const variants = await Promise.all(angles.map((angle) => rotateBlob(blob, angle)));

  for (const variant of variants) {
    const native = await decodeWithBarcodeDetector(variant);
    if (native) return native;
  }
  for (const variant of variants) {
    const zxing = await decodeWithZXing(variant);
    if (zxing) return zxing;
  }
  return null;
}

async function renderVideoCropVariant(
  video: HTMLVideoElement,
  crop: { x: number; y: number; w: number; h: number },
  mode: 'normal' | 'enhanced'
): Promise<Blob | null> {
  const sourceW = video.videoWidth || 0;
  const sourceH = video.videoHeight || 0;
  if (sourceW <= 0 || sourceH <= 0) return null;

  const sx = Math.max(0, Math.min(sourceW - 1, Math.round(sourceW * crop.x)));
  const sy = Math.max(0, Math.min(sourceH - 1, Math.round(sourceH * crop.y)));
  const sw = Math.max(1, Math.min(sourceW - sx, Math.round(sourceW * crop.w)));
  const sh = Math.max(1, Math.min(sourceH - sy, Math.round(sourceH * crop.h)));

  const scale = mode === 'enhanced' ? 1.9 : 1.35;
  const outW = Math.max(320, Math.round(sw * scale));
  const outH = Math.max(120, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = mode !== 'enhanced';
  ctx.filter = mode === 'enhanced' ? 'grayscale(1) contrast(2.0) brightness(1.15)' : 'none';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  ctx.filter = 'none';

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
  });
}

async function tryDecodeBarcodeFromVideo(video: HTMLVideoElement): Promise<string | null> {
  const crops = [
    { x: 0.00, y: 0.00, w: 1.00, h: 1.00 },
    { x: 0.08, y: 0.22, w: 0.84, h: 0.56 },
    { x: 0.05, y: 0.42, w: 0.90, h: 0.45 },
  ];

  for (const crop of crops) {
    const normal = await renderVideoCropVariant(video, crop, 'normal');
    if (normal) {
      const hit = await tryDecodeBarcodeFromBlob(normal, true);
      if (hit) return hit;
    }

    const enhanced = await renderVideoCropVariant(video, crop, 'enhanced');
    if (enhanced) {
      const hit = await tryDecodeBarcodeFromBlob(enhanced, true);
      if (hit) return hit;
    }
  }
  return null;
}

  const submitManualBarcode = async () => {
    setManualBarcodeError(null);
    const normalized = normalizeBarcode(manualBarcode);
    if (!normalized || !isLikelyProductBarcode(normalized)) {
      setManualBarcodeError('Skriv inn 8-14 sifre (EAN/UPC).');
      return;
    }

    const found = await handleBarcodeDetected(normalized, false);
    if (found) {
      setShowBarcodeEntry(false);
      setManualBarcode('');
    } else {
      setManualBarcodeError('Fant ikke produkt for denne strekkoden.');
    }
  };

  function extractImageUrl(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = (raw as OffProductRaw).product?.image_url;
    return typeof candidate === 'string' ? candidate : undefined;
  }

  function isInvalidVisionLabel(label: string) {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return true;
    const nonFoodHints = [
      'person',
      'human',
      'man',
      'woman',
      'boy',
      'girl',
      'face',
      'hand',
      'arm',
      'leg',
      'room',
      'kitchen',
      'table',
      'chair',
      'sofa',
      'wall',
      'floor',
      'ceiling',
      'packaging',
      'wrapper',
      'label',
      'bottle',
      'flask',
      'container',
      'can',
      'jar',
      'car',
      'truck',
      'bus',
      'train',
      'bike',
      'bicycle',
      'motorcycle',
      'vehicle',
      'road',
      'street',
      'tv',
      'television',
      'display',
      'remote',
      'keyboard',
      'mouse',
      'computer',
      'phone',
      'mobile',
      'book',
      'laptop',
      'screen',
      'monitor',
    ];
    if (nonFoodHints.some((hint) => normalized === hint || normalized.includes(hint))) {
      return true;
    }
    if (normalized.includes('.jpg') || normalized.includes('.jpeg') || normalized.includes('.png') || normalized.includes('.webp')) {
      return true;
    }
    return normalized.length < 2;
  }

  function extractPredictionsFromAI(raw: unknown, limit = 5): VisionPrediction[] {
    if (!raw || typeof raw !== 'object') return [];

    const source = raw as {
      label?: unknown;
      name?: unknown;
      predictions?: Array<{ label?: unknown; class?: unknown; confidence?: unknown; score?: unknown }>;
      concepts?: Array<{ name?: unknown; value?: unknown }>;
      tags?: Array<{ name?: unknown }>;
      confidence?: unknown;
      score?: unknown;
    };

    const candidates: VisionPrediction[] = [];

    if (source.label || source.name) {
      const label = (source.label ?? source.name ?? '').toString().trim();
      const confidence = typeof source.confidence === 'number'
        ? source.confidence
        : (typeof source.score === 'number' ? source.score : 0);
      candidates.push({ label, confidence });
    }

    for (const p of source.predictions ?? []) {
      const label = (p?.label ?? p?.class ?? '').toString().trim();
      const confidence = typeof p?.confidence === 'number'
        ? p.confidence
        : (typeof p?.score === 'number' ? p.score : 0);
      candidates.push({ label, confidence });
    }

    for (const c of source.concepts ?? []) {
      const label = (c?.name ?? '').toString().trim();
      const confidence = typeof c?.value === 'number' ? c.value : 0;
      candidates.push({ label, confidence });
    }

    for (const tag of source.tags ?? []) {
      const label = (tag?.name ?? '').toString().trim();
      candidates.push({ label, confidence: 0.4 });
    }

    const bestByLabel = new Map<string, VisionPrediction>();
    for (const candidate of candidates) {
      if (isInvalidVisionLabel(candidate.label)) continue;
      const key = candidate.label.toLowerCase().trim();
      const prev = bestByLabel.get(key);
      if (!prev || candidate.confidence > prev.confidence) {
        bestByLabel.set(key, candidate);
      }
    }

    return [...bestByLabel.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  function combineConfidence(aiConfidence: number, resolverConfidence: number) {
    return Math.min(0.98, Math.max(0.35, aiConfidence * resolverConfidence));
  }

  function detectChocolateMilkHint(predictions: VisionPrediction[]) {
    const text = predictions.map((p) => p.label.toLowerCase()).join(' ');
    const hasChoco = /(sjok|choc|kakao|cacao)/.test(text);
    const hasMilk = /(melk|milk)/.test(text);
    return hasChoco && hasMilk;
  }

  function tokenizeForMatch(value: string) {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1);
  }

  function hasAnyToken(text: string, hints: string[]) {
    const lower = text.toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  }

  function semanticCandidateScore(predictionLabel: string, candidate: NutritionResult) {
    const predTokens = tokenizeForMatch(predictionLabel);
    const candidateText = `${candidate.name} ${candidate.brand ?? ''}`;
    const candidateTokens = tokenizeForMatch(candidateText);
    if (!predTokens.length || !candidateTokens.length) return 0;

    const candidateSet = new Set(candidateTokens);
    const overlap = predTokens.reduce((acc, token) => (candidateSet.has(token) ? acc + 1 : acc), 0);
    const overlapScore = overlap / Math.max(1, Math.min(predTokens.length, candidateTokens.length));

    const predIsChocolateMilk = hasAnyToken(predictionLabel, ['sjok', 'choc', 'kakao', 'cacao']) &&
      hasAnyToken(predictionLabel, ['melk', 'milk']);
    const candIsChocolateMilk = hasAnyToken(candidateText, ['sjok', 'choc', 'kakao', 'cacao']) &&
      hasAnyToken(candidateText, ['melk', 'milk']);
    if (predIsChocolateMilk && !candIsChocolateMilk) return 0;

    const predIsMangoDrink = hasAnyToken(predictionLabel, ['mango']) &&
      hasAnyToken(predictionLabel, ['drink', 'juice', 'soda', 'brus', 'nektar', 'nectar', 'drikk']);
    if (predIsMangoDrink && !hasAnyToken(candidateText, ['mango', 'juice', 'soda', 'brus', 'drikk', 'nectar', 'nektar'])) {
      return 0;
    }

    return overlapScore;
  }

  function withDetectionMetadata(result: NutritionResult, meta: Record<string, unknown>): NutritionResult {
    const existingRaw = result.raw && typeof result.raw === 'object' ? (result.raw as Record<string, unknown>) : {};
    return {
      ...result,
      raw: { ...existingRaw, ...meta },
    };
  }

  async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T | TimedOutMarker> {
    let timeoutId: number | null = null;
    try {
      const timeoutPromise = new Promise<TimedOutMarker>((resolve) => {
        timeoutId = window.setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      });
      return await Promise.race([task, timeoutPromise]);
    } finally {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function isTimedOut(value: unknown): value is TimedOutMarker {
    return typeof value === 'object' && value !== null && 'timedOut' in value;
  }

  async function loadImageElement(source: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(source);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode image.'));
      };
      img.src = url;
    });
  }

  async function loadImageDimensions(source: Blob) {
    const img = await loadImageElement(source);
    return { width: img.naturalWidth, height: img.naturalHeight };
  }

  async function preprocessImage(source: Blob) {
    const original = await loadImageDimensions(source);
    const longestSide = Math.max(original.width, original.height);
    const scale = longestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestSide : 1;
    const width = Math.max(1, Math.round(original.width * scale));
    const height = Math.max(1, Math.round(original.height * scale));
    const img = await loadImageElement(source);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context for preprocessing.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const processedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', JPEG_QUALITY);
    });
    if (!processedBlob) {
      throw new Error('Could not preprocess image.');
    }

    return {
      blob: processedBlob,
      original,
      processed: { width, height, bytes: processedBlob.size },
    };
  }

  async function runVisionOnImage(
    url: string,
    trace: ScanTrace,
    sourceBlob?: Blob,
    externalSignal?: AbortSignal
  ): Promise<unknown | null> {
    try {
      const blob = sourceBlob ?? await (await fetch(url)).blob();
      const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
      const form = new FormData();
      form.append('image', file);
      form.append('scanRequestId', trace.scanRequestId);
      form.append('deviceInfo', trace.deviceInfo);
      form.append('scanMode', mode);
      form.append('rotationDegrees', '0');

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), MAX_VISION_WAIT_MS);
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      trace.mark('UPLOAD_START', {
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

      trace.mark('UPLOAD_DONE', {
        httpStatus: response.status,
      });

      const responseText = await response.text();
      const responseSizeBytes = new TextEncoder().encode(responseText).length;
      const contentType = response.headers.get('content-type') || 'unknown';
      trace.mark('API_RESPONSE_RECEIVED', {
        httpStatus: response.status,
        responseSizeBytes,
        contentType,
      });

      let data: unknown;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        const snippet = responseText.slice(0, 180).replace(/\s+/g, ' ');
        throw new Error(`Invalid API response (HTTP ${response.status}, ${contentType}): ${snippet}`);
      }

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
      const predictedProduct = typeof parsed?.predicted_product === 'string'
        ? parsed.predicted_product.trim()
        : '';
      const predictionsFromItems = items.flatMap((item) => {
        const name = (item?.name ?? '').trim();
        const brand = (item?.brand ?? '').trim();
        const productName = (item?.product_name ?? '').trim();
        const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
        const baseConfidence = typeof item?.confidence === 'number' ? item.confidence : 0;
        const reasonBoost =
          (reasons.includes('barcode_exact') ? 0.12 : 0) +
          (reasons.includes('brand_plus_product') ? 0.10 : 0) +
          (reasons.includes('product_exact') ? 0.08 : 0) +
          (reasons.includes('brand_exact') ? 0.05 : 0);
        const boosted = Math.min(0.99, Math.max(0, baseConfidence + reasonBoost));
        const candidates = [
          name,
          `${brand} ${productName}`.trim(),
          brand,
          productName,
        ].filter((candidate, index, arr) => candidate && arr.indexOf(candidate) === index);

        return candidates.map((label) => ({
          label,
          confidence: boosted,
        }));
      });
      const predictionsFromDetections = detections.map((det: { label?: string; confidence?: number }) => ({
        label: det?.label ?? '',
        confidence: typeof det?.confidence === 'number' ? det.confidence : 0,
      }));
      const predictionsFromText = textDetections.flatMap((entry: { text?: string; confidence?: number }) => {
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

      // Priority: catalog prediction first, then dictionary-ranked items, detector and OCR fallbacks.
      const mergedByLabel = new Map<string, { label: string; confidence: number }>();
      for (const entry of [...predictionsFromCatalog, ...predictionsFromItems, ...predictionsFromDetections, ...predictionsFromText]) {
        const normalizedLabel = entry.label.trim().toLowerCase();
        if (!normalizedLabel || entry.confidence <= 0) continue;
        const previous = mergedByLabel.get(normalizedLabel);
        if (!previous || entry.confidence > previous.confidence) {
          mergedByLabel.set(normalizedLabel, { label: entry.label.trim(), confidence: entry.confidence });
        }
      }

      const mergedPredictions = [...mergedByLabel.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8);

      const parsedScanLogId = typeof parsed?.scan_log_id === 'string'
        ? parsed.scan_log_id
        : (typeof parsed?.meta?.scanLogId === 'string' ? parsed.meta.scanLogId : null);
      const debugData: Record<string, unknown> = parsed?.debug && typeof parsed.debug === 'object'
        ? parsed.debug
        : {};
      const dishPredictionsRaw = Array.isArray(debugData.dish_predictions)
        ? (debugData.dish_predictions as Array<{ label?: unknown; confidence?: unknown }>)
        : [];
      const predictionsFromDish = dishPredictionsRaw
        .map((entry) => ({
          label: String(entry?.label ?? '').trim(),
          confidence: typeof entry?.confidence === 'number'
            ? Math.max(0.25, Math.min(0.92, entry.confidence))
            : 0,
        }))
        .filter((entry) => entry.label && entry.confidence > 0);

      const mergedWithDish = [...mergedPredictions, ...predictionsFromDish];
      const mergedByDishLabel = new Map<string, { label: string; confidence: number }>();
      for (const entry of mergedWithDish) {
        const key = entry.label.toLowerCase().trim();
        if (!key) continue;
        const prev = mergedByDishLabel.get(key);
        if (!prev || entry.confidence > prev.confidence) {
          mergedByDishLabel.set(key, entry);
        }
      }
      const finalPredictions = [...mergedByDishLabel.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8);
      const labelResolutionState = typeof debugData.label_resolution_state === 'string'
        ? debugData.label_resolution_state
        : 'ready';
      const retryGuidance = typeof debugData.retry_guidance === 'string'
        ? debugData.retry_guidance
        : null;

      if (labelResolutionState === 'needs_recapture') {
        return {
          label: '',
          confidence: 0,
          predictions: finalPredictions,
          scanLogId: parsedScanLogId,
          isDummyProvider,
          needsRecapture: true,
          retryGuidance,
        };
      }
      if (!finalPredictions.length) return null;

      const best = finalPredictions[0] as { label?: string; confidence?: number };
      return {
        label: best?.label ?? '',
        confidence: typeof best?.confidence === 'number' ? best.confidence : 0,
        predictions: finalPredictions,
        scanLogId: parsedScanLogId,
        isDummyProvider,
        needsRecapture: false,
        retryGuidance: null,
      };
    } catch (err) {
      if ((externalSignal?.aborted) || (err instanceof DOMException && err.name === 'AbortError')) {
        if (externalSignal?.aborted) {
          throw new Error('REQUEST_CANCELLED');
        }
        throw new Error('SCAN_TIMEOUT');
      }
      console.warn('Vision detect failed:', err);
      throw err;
    }
  }

  async function runDishPredictOnImage(
    url: string,
    trace: ScanTrace,
    sourceBlob?: Blob,
    imageHash?: string | null,
    externalSignal?: AbortSignal
  ): Promise<{ predictions: VisionPrediction[]; latencyMs: number; circuitOpen: boolean }> {
    try {
      if (imageHash) {
        const cached = dishPredictionCacheRef.current.get(imageHash);
        if (cached) {
          return { predictions: cached.predictions, latencyMs: cached.latencyMs, circuitOpen: false };
        }
      }
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
            'X-Scan-Device-Id': getClientDeviceId(),
          },
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!response.ok) return { predictions: [], latencyMs: Math.round(performance.now() - startedAt), circuitOpen: false };

      const parsed = await response.json() as {
        results?: Array<{ label?: string; confidence?: number }>;
        meta?: { circuitOpen?: unknown };
      };
      const rows = Array.isArray(parsed.results) ? parsed.results : [];
      const filtered = filterDishPredictionSeeds(
        rows
        .map((row) => ({
          label: normalizeDishLabel(row.label ?? ''),
          confidence: typeof row.confidence === 'number' ? row.confidence : 0,
        }))
      );
      const latencyMs = Math.round(performance.now() - startedAt);
      if (imageHash) {
        dishPredictionCacheRef.current.set(imageHash, { predictions: filtered, latencyMs });
      }
      return {
        predictions: filtered,
        latencyMs,
        circuitOpen: parsed?.meta?.circuitOpen === true,
      };
    } catch (err) {
      if ((externalSignal?.aborted) || (err instanceof DOMException && err.name === 'AbortError')) {
        throw new Error('REQUEST_CANCELLED');
      }
      return { predictions: [], latencyMs: 0, circuitOpen: false };
    }
  }

  async function runOCRSeedExtraction(
    sourceBlob: Blob,
    trace: ScanTrace,
    imageHash?: string | null,
    externalSignal?: AbortSignal
  ): Promise<OCRExtractionResult> {
    try {
      if (imageHash) {
        const cached = ocrSeedCacheRef.current.get(imageHash);
        if (cached) {
          return { ...cached, latencyMs: 0 };
        }
      }
      const startedAt = performance.now();
      const cropped = await cropCenterForOCR(sourceBlob, 0.62);
      if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
      const locale = window.navigator.language || 'en-US';
      const textGate = await detectLikelyTextInBlob(cropped);
      if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
      if (!textGate.looksLikeText) {
        const latencyMs = Math.round(performance.now() - startedAt);
        trace.mark('RESULT_PARSED', {
          stage: 'ocr_skipped_no_text_structure',
          latencyMs,
          transitionRatio: Number(textGate.transitionRatio.toFixed(4)),
          transitionCount: textGate.transitionCount,
        });
        return {
          seeds: [],
          brandSeeds: [],
          latencyMs,
          preprocessTried: [],
          preprocessChosen: 'normal',
          rotationTried: [],
          rotationChosen: 0,
          runCount: 0,
          textCharCount: 0,
          bestLineScore: 0,
          seedCount: 0,
          brandBoostHitCount: 0,
          brandBoostCanonicals: [],
          brandBoostUsed: false,
        };
      }

      const preprocessTried: OcrPreprocessMode[] = [];
      const rotationTried: number[] = [];
      let runCount = 0;
      let chosen: OcrPreprocessMode = 'normal';
      let chosenRotation = 0;
      let chosenSeeds: VisionPrediction[] = [];
      let chosenRawText = '';
      let chosenQuality = { weak: true, textCharCount: 0, bestLineScore: 0, lineScoreSum: 0 };

      const evaluate = async (mode: OcrPreprocessMode, rotation: 0 | 90) => {
        const nextRun = runCount + 1;
        if (nextRun > 1) {
          setScanStatus(`Leser tekst ... (${nextRun}/4)`);
        }
        preprocessTried.push(mode);
        rotationTried.push(rotation);
        runCount += 1;
        const rotated = await rotateBlobForOcr(cropped, rotation);
        if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
        const preprocessed = await preprocessBlobForOcr(rotated, getOcrPreprocessPreset(mode));
        if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
        const lines = await ocrImageToLines(preprocessed, locale, 7000);
        if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
        let rawText = lines.map((line) => line.text).join(' ').trim();
        let seeds = filterOCRPredictionSeeds(ocrLinesToSeeds(lines, 6));
        if (!seeds.length) {
          const text = await ocrImageToText(preprocessed, locale, 3500);
          if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
          rawText = `${rawText} ${text}`.trim();
          seeds = filterOCRPredictionSeeds(ocrTextToSeeds(text, 6));
        }
        const textStats = getOcrTextStats(rawText);
        const isDigitOnlyish = textStats.lettersCount === 0 && textStats.digitsCount > 0;
        if (isDigitOnlyish || textStats.lettersCount < 3) {
          seeds = [];
        }
        const quality = summarizeOcrQuality(lines, seeds);
        if (quality.textCharCount < 8 && (seeds.length === 0 || quality.bestLineScore < 0.55)) {
          seeds = [];
        }
        const score = (seeds.length * 10) + (quality.bestLineScore * 4) + (quality.textCharCount / 32);
        const chosenScore = (chosenSeeds.length * 10) + (chosenQuality.bestLineScore * 4) + (chosenQuality.textCharCount / 32);
        if (!chosenSeeds.length || score > chosenScore) {
          chosen = mode;
          chosenRotation = rotation;
          chosenSeeds = seeds;
          chosenRawText = rawText;
          chosenQuality = quality;
        }
        return quality;
      };

      const qualityNormal0 = await evaluate('normal', 0);
      if (qualityNormal0.weak) {
        const qualityNormal90 = await evaluate('normal', 90);
        if (qualityNormal90.weak) {
          const qualityAggressive0 = await evaluate('aggressive', 0);
          if (qualityAggressive0.weak) {
            const qualityAggressive90 = await evaluate('aggressive', 90);
            if (qualityAggressive90.weak && !ocrWeakHintedRef.current) {
              ocrWeakHintedRef.current = true;
              showFeedback('Prøv å holde boksen litt skrått for å unngå refleks, og nærmere OCR SONEN.', 'info');
            }
          }
        }
      }

      let brandBoostedSeeds: VisionPrediction[] = [];
      let brandBoostHitCount = 0;
      let brandBoostCanonicals: string[] = [];
      let brandBoostUsed = false;
      if (chosenQuality.bestLineScore < 0.62 || chosenSeeds.length < 2) {
        const boost = brandBoostFromOcrText(chosenRawText, {
          bestLineScore: chosenQuality.bestLineScore,
          textCharCount: chosenQuality.textCharCount,
        });
        brandBoostHitCount = boost.hits.length;
        brandBoostCanonicals = boost.hits.map((hit) => hit.canonical);
        if (boost.hits.length) {
          brandBoostedSeeds = filterOCRPredictionSeeds(
            boost.boostedSeeds.slice(0, 6).map((label) => ({ label, confidence: 0.66 }))
          );
          brandBoostUsed = brandBoostedSeeds.length > 0;
        }
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      const result: OCRExtractionResult = {
        seeds: chosenSeeds,
        brandSeeds: brandBoostedSeeds,
        latencyMs,
        preprocessTried,
        preprocessChosen: chosen,
        rotationTried,
        rotationChosen: chosenRotation,
        runCount,
        textCharCount: chosenQuality.textCharCount,
        bestLineScore: Number(chosenQuality.bestLineScore.toFixed(3)),
        seedCount: chosenSeeds.length,
        brandBoostHitCount,
        brandBoostCanonicals,
        brandBoostUsed,
      };
      if (imageHash) {
        ocrSeedCacheRef.current.set(imageHash, result);
      }
      trace.mark('RESULT_PARSED', {
        stage: 'ocr_seeds_ready',
        count: chosenSeeds.length,
        latencyMs,
        ocrPreprocessTried: preprocessTried,
        ocrPreprocessChosen: chosen,
        ocrRotationTried: rotationTried,
        ocrRotationChosen: chosenRotation,
        ocrRunCount: runCount,
        ocrTextCharCount: chosenQuality.textCharCount,
        ocrBestLineScore: Number(chosenQuality.bestLineScore.toFixed(3)),
        ocrBrandBoostHitCount: brandBoostHitCount,
        ocrBrandBoostCanonicals: brandBoostCanonicals,
        ocrBrandBoostUsed: brandBoostUsed,
      });
      return result;
    } catch (err) {
      if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
      if (!ocrUnavailableHintedRef.current) {
        ocrUnavailableHintedRef.current = true;
        showFeedback('Tekstlesing utilgjengelig akkurat naa - fortsetter uten OCR.', 'info');
      }
      trace.mark('RESULT_PARSED', {
        stage: 'ocr_seeds_failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        seeds: [],
        brandSeeds: [],
        latencyMs: 0,
        preprocessTried: [],
        preprocessChosen: 'normal',
        rotationTried: [],
        rotationChosen: 0,
        runCount: 0,
        textCharCount: 0,
        bestLineScore: 0,
        seedCount: 0,
        brandBoostHitCount: 0,
        brandBoostCanonicals: [],
        brandBoostUsed: false,
      };
    }
  }

  const processImageForNutrition = async (
    url: string,
    trace: ScanTrace,
    blobForVision?: Blob,
    originalBlobForBarcode?: Blob
  ) => {
    const run = beginResolveRun();
    setIsScanning(true);
    setScanState('idle');
    setScanStatus('Analyserer bilde...');
    setSelectedDishSeed(null);
    setDishPredictions([]);
    ocrWeakHintedRef.current = false;
    activeScanTraceRef.current = trace;
    scanMetricsRef.current = {
      scanSessionId: trace.scanRequestId,
      imageHash: null,
      scanStartedAtMs: performance.now(),
      predictLatencyMs: null,
      resolveLatencyMs: null,
      resolverChosenItemId: null,
      resolverChosenScore: null,
      resolverChosenConfidence: null,
      resolverSuccessSeedIndex: null,
      resolverSuccessSeedSource: null,
      timeToFirstCandidateMs: null,
      hadCorrectionTap: false,
      manualSearchUsed: false,
      circuitOpen: false,
      ocrPreprocessTried: [],
      ocrPreprocessChosen: null,
      ocrTextCharCount: null,
      ocrBestLineScore: null,
      ocrSeedCount: null,
      ocrRotationTried: [],
      ocrRotationChosen: null,
      ocrRunCount: null,
      ocrBrandBoostHitCount: null,
      ocrBrandBoostCanonicals: [],
      ocrBrandBoostUsed: null,
      ocrBrandBoostTopCanonical: null,
    };

    try {
      const sourceBlob = blobForVision ?? await (await fetch(url)).blob();
      const imageHash = await computeDHash(sourceBlob);
      latestImageHashRef.current = imageHash;
      scanMetricsRef.current.imageHash = imageHash;
      resolverSessionCacheRef.current.ensure(imageHash);
      const ocrSeedPromise = runOCRSeedExtraction(sourceBlob, trace, imageHash, run.signal).then((result) => {
        scanMetricsRef.current.ocrPreprocessTried = result.preprocessTried;
        scanMetricsRef.current.ocrPreprocessChosen = result.preprocessChosen;
        scanMetricsRef.current.ocrTextCharCount = result.textCharCount;
        scanMetricsRef.current.ocrBestLineScore = result.bestLineScore;
        scanMetricsRef.current.ocrSeedCount = result.seedCount;
        scanMetricsRef.current.ocrRotationTried = result.rotationTried;
        scanMetricsRef.current.ocrRotationChosen = result.rotationChosen;
        scanMetricsRef.current.ocrRunCount = result.runCount;
        scanMetricsRef.current.ocrBrandBoostHitCount = result.brandBoostHitCount;
        scanMetricsRef.current.ocrBrandBoostCanonicals = result.brandBoostCanonicals;
        scanMetricsRef.current.ocrBrandBoostUsed = result.brandBoostUsed;
        scanMetricsRef.current.ocrBrandBoostTopCanonical = result.brandBoostCanonicals[0] ?? null;
        return { ocrSeeds: result.seeds, brandSeeds: result.brandSeeds };
      });
      const dishPredictionPromise = runDishPredictOnImage(url, trace, sourceBlob, imageHash, run.signal).then((result) => {
        if (!isCurrentResolveRun(run.id)) return result.predictions;
        setDishPredictions(result.predictions);
        scanMetricsRef.current.predictLatencyMs = result.latencyMs;
        if (result.circuitOpen) {
          showFeedback('AI-forslag utilgjengelig akkurat nå - fortsetter med skann.', 'info');
        }
        trace.mark('RESULT_PARSED', {
          stage: 'dish_prediction_ready',
          count: result.predictions.length,
          latencyMs: result.latencyMs,
        });
        return result.predictions;
      });
      const rawAIResult = await runVisionOnImage(url, trace, sourceBlob, run.signal);
      const dishPredictions = await dishPredictionPromise;
      const ocrResult = await ocrSeedPromise;
      if (!isCurrentResolveRun(run.id)) return;
      const rawResultObject = rawAIResult && typeof rawAIResult === 'object'
        ? (rawAIResult as {
          scanLogId?: unknown;
          isDummyProvider?: unknown;
          needsRecapture?: unknown;
          retryGuidance?: unknown;
        })
        : null;
      const nextScanLogId = typeof rawResultObject?.scanLogId === 'string' ? rawResultObject.scanLogId : null;
      setScanLogId(nextScanLogId);
      if (rawResultObject?.needsRecapture === true) {
        setPredictionOptions([]);
        setDishPredictions([]);
        setScanState('idle');
        showFeedback(
          typeof rawResultObject.retryGuidance === 'string' && rawResultObject.retryGuidance.trim()
            ? rawResultObject.retryGuidance
            : 'Flytt kameraet naermere, reduser gjenskinn og ta et nytt bilde av frontetiketten.',
          'info'
        );
        trace.mark('UI_UPDATED', { outcome: 'needs_recapture' });
        return;
      }
      if (rawResultObject?.isDummyProvider === true) {
        showFeedback('Bildegjenkjenning kjører i dummy-modus. Sett PROVIDER=yolo i food_detection_bot/.env for ekte deteksjon.', 'info');
      }

      console.log('AI raw response:', rawAIResult);

      const predictions = extractPredictionsFromAI(rawAIResult, 6).map((entry) => ({
        label: normalizeDishLabel(entry.label),
        confidence: entry.confidence,
      }));
      const resolverSeeds = buildResolverSeeds(predictions, dishPredictions, ocrResult.brandSeeds, ocrResult.ocrSeeds);
      const finalPredictions = resolverSeeds.map((entry) => ({ label: entry.label, confidence: entry.confidence }));

      setPredictionOptions(finalPredictions.slice(0, 6));
      trace.mark('RESULT_PARSED', { predictionCount: finalPredictions.length, resolverSeedCount: resolverSeeds.length });
      if (!resolverSeeds.length) {
        const barcodeBlob = originalBlobForBarcode ?? blobForVision ?? await (await fetch(url)).blob();
        setScanStatus('Prøver strekkode...');
        const barcode = await tryDecodeBarcodeFromBlob(barcodeBlob);
        if (barcode) {
          const resolved = await handleBarcodeDetected(barcode, false);
          if (resolved) {
            noPredictionCountRef.current = 0;
            trace.mark('UI_UPDATED', { outcome: 'photo_barcode_success', barcode });
            return;
          }
        }
        const visualMatch = await findVisualAnchorMatch(barcodeBlob);
        if (visualMatch) {
          const quality = Math.max(0.45, Math.min(0.9, 1 - visualMatch.distance / 20));
          setScannedFood({
            name: visualMatch.anchor.name,
            calories: visualMatch.anchor.per100g?.kcal ?? 0,
            protein: visualMatch.anchor.per100g?.protein_g ?? 0,
            carbs: visualMatch.anchor.per100g?.carbs_g ?? 0,
            fat: visualMatch.anchor.per100g?.fat_g ?? 0,
            per100g: visualMatch.anchor.per100g ?? null,
            confidence: Math.round(quality * 100),
            image: url,
          });
          markFirstCandidateShown();
          trace.mark('UI_UPDATED', {
            outcome: 'visual_anchor_match',
            distance: visualMatch.distance,
            matchedName: visualMatch.anchor.name,
          });
          return;
        }
        noPredictionCountRef.current += 1;
        setScanState('idle');
        showFeedback('Fant ikke tydelig nok treff i bildet. Prøv et nytt bilde eller bruk strekkode.', 'info');
        trace.mark('UI_UPDATED', { outcome: 'no_predictions_retry', retryCount: noPredictionCountRef.current });
        return;
      }
      noPredictionCountRef.current = 0;

      if (detectChocolateMilkHint(finalPredictions)) {
        setScanStatus('Soker etter sjokolademelk...');
        const direct = await withTimeout(resolveLabelOFFWithCandidates('sjokolademelk', {}, 3), MAX_RESOLVER_WAIT_MS);
        if (!isTimedOut(direct) && direct.best) {
          const aiConfidence = Math.max(...finalPredictions.map((p) => p.confidence), 0.55);
          const combined = combineConfidence(aiConfidence, direct.best.confidence);
          setScannedFood({
            name: direct.best.name,
            calories: direct.best.per100g?.kcal ?? 0,
            protein: direct.best.per100g?.protein_g ?? 0,
            carbs: direct.best.per100g?.carbs_g ?? 0,
            fat: direct.best.per100g?.fat_g ?? 0,
            per100g: direct.best.per100g ?? null,
            confidence: Math.round(combined * 100),
            image: url,
          });
          resolverSessionCacheRef.current.setBySeed(imageHash, 'sjokolademelk', {
            name: direct.best.name,
            calories: direct.best.per100g?.kcal ?? 0,
            protein: direct.best.per100g?.protein_g ?? 0,
            carbs: direct.best.per100g?.carbs_g ?? 0,
            fat: direct.best.per100g?.fat_g ?? 0,
            per100g: direct.best.per100g ?? null,
            confidence: Math.round(combined * 100),
            image: url,
          });
          markFirstCandidateShown();
          trace.mark('UI_UPDATED', {
            outcome: 'chocolate_milk_direct_match',
            resolvedName: direct.best.name,
          });
          void storeVisualAnchorFromCurrentImage(direct.best);
          return;
        }
      }

      setScanStatus('Soker i matdatabaser...');
      const resolveStartedAt = performance.now();

      const rankedResult = await withTimeout(
        (async () => {
          const resolvedEntries = await Promise.all(
            resolverSeeds.slice(0, 4).map(async (prediction) => {
              const [matResult, offResult] = await Promise.all([
                withTimeout(resolveLabelMatvaretabellen(prediction.label), MAX_RESOLVER_WAIT_MS),
                withTimeout(resolveLabelOFFWithCandidates(prediction.label, {}, 3), MAX_RESOLVER_WAIT_MS),
              ]);

              const matCandidates =
                !isTimedOut(matResult) && matResult.best
                  ? matResult.candidates
                  : [];
              const offCandidates =
                !isTimedOut(offResult)
                  ? offResult.candidates
                  : [];

              const sourceCandidates = matCandidates.length ? matCandidates : offCandidates;
              return sourceCandidates.slice(0, 2).map((candidate) => {
                const semantic = semanticCandidateScore(prediction.label, candidate);
                if (semantic <= 0.02) return null;
                const combined = combineConfidence(Math.max(0.1, prediction.confidence), candidate.confidence);
                const semanticBoosted = Math.min(0.99, combined * (0.75 + 0.5 * semantic));
                const enriched = withDetectionMetadata(candidate, {
                  aiLabel: prediction.label,
                  aiConfidence: prediction.confidence,
                  combinedConfidence: semanticBoosted,
                  semanticScore: semantic,
                  resolverSeedSource: prediction.source,
                  resolverSeedIndex: prediction.seedIndex ?? null,
                });
                const key = `${candidate.source}:${candidate.name}:${candidate.brand ?? ''}`;
                return { key, item: enriched, combined: semanticBoosted };
              }).filter((entry): entry is { key: string; item: NutritionResult; combined: number } => entry !== null);
            })
          );

          const resolvedByKey = new Map<string, { item: NutritionResult; combined: number }>();
          for (const group of resolvedEntries) {
            for (const entry of group) {
              const prev = resolvedByKey.get(entry.key);
              if (!prev || entry.combined > prev.combined) {
                resolvedByKey.set(entry.key, { item: entry.item, combined: entry.combined });
              }
            }
          }

          return [...resolvedByKey.values()].sort((a, b) => b.combined - a.combined);
        })(),
        MAX_TOTAL_MATCH_WAIT_MS
      );
      if (!isCurrentResolveRun(run.id)) return;
      scanMetricsRef.current.resolveLatencyMs = Math.round(performance.now() - resolveStartedAt);

      if (isTimedOut(rankedResult) || rankedResult.length === 0) {
        const fallbackSeeds = resolverSeeds
          .map((prediction) => ({ ...prediction, label: prediction.label.trim() }))
          .filter((prediction) => Boolean(prediction.label))
          .slice(0, 4);
        for (const fallbackSeed of fallbackSeeds) {
          const quickFallback = await withTimeout(resolveLabelOFFWithCandidates(fallbackSeed.label, {}, 1), 4000);
          if (isTimedOut(quickFallback) || !quickFallback.best) continue;
          const predictionHint = resolverSeeds.find((prediction) => prediction.label.trim().toLowerCase() === fallbackSeed.label.toLowerCase());
          const combined = combineConfidence(
            Math.max(0.25, predictionHint?.confidence ?? 0.25),
            quickFallback.best.confidence
          );
          setScannedFood({
            name: quickFallback.best.name,
            calories: quickFallback.best.per100g?.kcal ?? 0,
            protein: quickFallback.best.per100g?.protein_g ?? 0,
            carbs: quickFallback.best.per100g?.carbs_g ?? 0,
            fat: quickFallback.best.per100g?.fat_g ?? 0,
            per100g: quickFallback.best.per100g ?? null,
            confidence: Math.round(combined * 100),
            image: url,
          });
          resolverSessionCacheRef.current.setBySeed(imageHash, fallbackSeed.label, {
            name: quickFallback.best.name,
            calories: quickFallback.best.per100g?.kcal ?? 0,
            protein: quickFallback.best.per100g?.protein_g ?? 0,
            carbs: quickFallback.best.per100g?.carbs_g ?? 0,
            fat: quickFallback.best.per100g?.fat_g ?? 0,
            per100g: quickFallback.best.per100g ?? null,
            confidence: Math.round(combined * 100),
            image: url,
          });
          markFirstCandidateShown();
          scanMetricsRef.current.resolverChosenItemId = makeResolvedItemId(quickFallback.best);
          scanMetricsRef.current.resolverChosenScore = combined;
          scanMetricsRef.current.resolverChosenConfidence = quickFallback.best.confidence;
          scanMetricsRef.current.resolverSuccessSeedIndex = fallbackSeed.seedIndex ?? null;
          scanMetricsRef.current.resolverSuccessSeedSource = fallbackSeed.source;
          trace.mark('UI_UPDATED', {
            outcome: 'resolver_quick_fallback_success',
            fallbackLabel: fallbackSeed.label,
            resolverSeedIndex: fallbackSeed.seedIndex ?? null,
            resolverSeedSource: fallbackSeed.source,
            resolvedName: quickFallback.best.name,
          });
          void storeVisualAnchorFromCurrentImage(quickFallback.best);
          return;
        }
        setManualLabel(fallbackSeeds[0]?.label ?? '');
        setScanState('needs_manual_label');
        showFeedback('Oppslag tok for lang tid. Jeg fylte inn forslag, prov manuell sok.', 'info');
        trace.mark('UI_UPDATED', { outcome: 'resolver_timeout_manual_label' });
        return;
      }

      let adjustedRankedResult = rankedResult;
      const activeCanonical = scanMetricsRef.current.ocrBrandBoostTopCanonical;
      if (scanMetricsRef.current.ocrBrandBoostUsed && activeCanonical) {
        const avoid = getBrandAvoidSet(activeCanonical);
        if (avoid.size > 0) {
          adjustedRankedResult = rankedResult
            .map((entry) => {
              const id = makeResolvedItemId(entry.item);
              return avoid.has(id.toLowerCase())
                ? { ...entry, combined: entry.combined * 0.82 }
                : entry;
            })
            .sort((a, b) => b.combined - a.combined);
        }
      }

      const bestResolved = adjustedRankedResult[0];
      const secondResolved = adjustedRankedResult[1];
      const topSeedConfidence = resolverSeeds[0]?.confidence ?? 0;

      if (shouldGateWrongButConfident(topSeedConfidence, bestResolved.combined)) {
        setCandidates(adjustedRankedResult.slice(0, 3).map((x) => ({ ...x.item, confidence: x.combined })));
        setShowCandidates(true);
        setScanState('needs_manual_label');
        markFirstCandidateShown();
        showFeedback('Fant ikke sikkert treff - velg en av disse eller søk manuelt.', 'info');
        trace.mark('UI_UPDATED', {
          outcome: 'high_prediction_low_resolver_confidence',
          topSeedConfidence,
          bestResolvedCombined: bestResolved.combined,
        });
        return;
      }

      if (secondResolved && (bestResolved.combined - secondResolved.combined) < 0.07) {
        setCandidates(adjustedRankedResult.slice(0, 3).map((x) => ({ ...x.item, confidence: x.combined })));
        setShowCandidates(true);
        markFirstCandidateShown();
        trace.mark('UI_UPDATED', {
          outcome: 'ambiguous_show_candidates',
          candidateCount: Math.min(3, adjustedRankedResult.length),
        });
        return;
      }

      const best = bestResolved.item;
      const bestRaw = best.raw && typeof best.raw === 'object' ? (best.raw as Record<string, unknown>) : {};
      scanMetricsRef.current.resolverChosenItemId = makeResolvedItemId(best);
      scanMetricsRef.current.resolverChosenScore = bestResolved.combined;
      scanMetricsRef.current.resolverChosenConfidence = best.confidence;
      scanMetricsRef.current.resolverSuccessSeedIndex = typeof bestRaw.resolverSeedIndex === 'number' ? bestRaw.resolverSeedIndex : null;
      scanMetricsRef.current.resolverSuccessSeedSource =
        bestRaw.resolverSeedSource === 'selected_prediction' ||
        bestRaw.resolverSeedSource === 'dish_prediction' ||
        bestRaw.resolverSeedSource === 'vision_prediction' ||
        bestRaw.resolverSeedSource === 'ocr_text' ||
        bestRaw.resolverSeedSource === 'ocr_brand'
          ? bestRaw.resolverSeedSource
          : null;
      setScannedFood({
        name: best.name,
        calories: best.per100g?.kcal ?? 0,
        protein: best.per100g?.protein_g ?? 0,
        carbs: best.per100g?.carbs_g ?? 0,
        fat: best.per100g?.fat_g ?? 0,
        per100g: best.per100g ?? null,
        confidence: Math.round(bestResolved.combined * 100),
        image: url,
      });
      resolverSessionCacheRef.current.setBest(imageHash, {
        name: best.name,
        calories: best.per100g?.kcal ?? 0,
        protein: best.per100g?.protein_g ?? 0,
        carbs: best.per100g?.carbs_g ?? 0,
        fat: best.per100g?.fat_g ?? 0,
        per100g: best.per100g ?? null,
        confidence: Math.round(bestResolved.combined * 100),
        image: url,
      });
      markFirstCandidateShown();
      trace.mark('UI_UPDATED', {
        outcome: 'success',
        resolvedName: best.name,
        resolverSeedIndex: scanMetricsRef.current.resolverSuccessSeedIndex,
        resolverSeedSource: scanMetricsRef.current.resolverSuccessSeedSource,
      });
      void storeVisualAnchorFromCurrentImage(best);
      noPredictionCountRef.current = 0;
    } catch (err) {
      if (err instanceof Error && err.message === 'REQUEST_CANCELLED') {
        return;
      }
      const timedOut = err instanceof Error && err.message === 'SCAN_TIMEOUT';
      if (timedOut) {
        showFeedback('Scan timed out. Please retry.', 'error');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Skanning feilet. Prov igjen.';
        showFeedback(errorMessage, 'error');
      }
      trace.mark('UI_UPDATED', {
        outcome: timedOut ? 'scan_timeout_error' : 'scan_error',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!isCurrentResolveRun(run.id)) return;
      setScanStatus('');
      setIsScanning(false);
      trace.mark('SCAN_END');
      if (activeScanTraceRef.current?.scanRequestId === trace.scanRequestId) {
        activeScanTraceRef.current = null;
      }
    }
  };

  const capturePhotoAndAnalyze = async () => {
    const trace = createScanTrace({ source: 'camera' });
    trace.mark('SCAN_START');
    const video = photoVideoRef.current;
    if (!video || video.readyState < 2) {
      setPhotoCamError('Kamera er ikke klart. Prøv igjen.');
      trace.mark('UI_UPDATED', { outcome: 'camera_not_ready' });
      trace.mark('SCAN_END');
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      showFeedback('Kunne ikke ta bilde fra kamera.', 'error');
      trace.mark('UI_UPDATED', { outcome: 'capture_failed' });
      trace.mark('SCAN_END');
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    stopPhotoCamera();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) {
      showFeedback('Kunne ikke lagre bildet.', 'error');
      trace.mark('UI_UPDATED', { outcome: 'capture_blob_failed' });
      trace.mark('SCAN_END');
      return;
    }
    trace.mark('IMAGE_CAPTURED', {
      width,
      height,
      imageBytes: blob.size,
    });

    try {
      const preprocessed = await preprocessImage(blob);
      trace.mark('PREPROCESS_DONE', {
        originalWidth: width,
        originalHeight: height,
        originalBytes: blob.size,
        processedWidth: preprocessed.processed.width,
        processedHeight: preprocessed.processed.height,
        processedBytes: preprocessed.processed.bytes,
      });

      if (prevUrlRef.current) {
        try { URL.revokeObjectURL(prevUrlRef.current); } catch { /* ignore */ }
      }
      const imageUrl = URL.createObjectURL(preprocessed.blob);
      prevUrlRef.current = imageUrl;

      await processImageForNutrition(imageUrl, trace, preprocessed.blob, blob);
    } catch (err) {
      showFeedback('Kunne ikke forberede bildet. Prøv igjen.', 'error');
      trace.mark('UI_UPDATED', {
        outcome: 'preprocess_error',
        error: err instanceof Error ? err.message : String(err),
      });
      trace.mark('SCAN_END');
    }
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const trace = createScanTrace({ source: 'file_picker' });
    trace.mark('SCAN_START');
    trace.mark('IMAGE_CAPTURED', {
      width: null,
      height: null,
      imageBytes: file.size,
    });

    try {
      const preprocessed = await preprocessImage(file);
      trace.mark('PREPROCESS_DONE', {
        originalWidth: preprocessed.original.width,
        originalHeight: preprocessed.original.height,
        originalBytes: file.size,
        processedWidth: preprocessed.processed.width,
        processedHeight: preprocessed.processed.height,
        processedBytes: preprocessed.processed.bytes,
      });

      if (prevUrlRef.current) {
        try { URL.revokeObjectURL(prevUrlRef.current); } catch { /* ignore */ }
      }

      const url = URL.createObjectURL(preprocessed.blob);
      prevUrlRef.current = url;
      await processImageForNutrition(url, trace, preprocessed.blob, file);
    } catch (err) {
      showFeedback('Kunne ikke forberede bildet. Prøv igjen.', 'error');
      trace.mark('UI_UPDATED', {
        outcome: 'preprocess_error',
        error: err instanceof Error ? err.message : String(err),
      });
      trace.mark('SCAN_END');
    }
  };

  async function resolveLabelToScannedFood(labelInput: string, runId: number): Promise<LabelResolveOutcome> {
    const label = labelInput.trim();
    if (!label) return 'no_match';

    setIsScanning(true);
    try {
      if (!isCurrentResolveRun(runId)) return 'error';
      const aiConfidence = 0.8;
      // Try Matvaretabellen first for Norwegian foods.
      const mat = await resolveLabelMatvaretabellen(label);
      if (mat && mat.best) {
        const bestMat = mat.best;
        if (mat.candidates.length > 1 && (aiConfidence * bestMat.confidence) < 0.85) {
          if (!isCurrentResolveRun(runId)) return 'error';
          setCandidates(mat.candidates);
          setShowCandidates(true);
          markFirstCandidateShown();
          return 'candidates';
        }

        const combinedConfidenceMat = Math.min(0.98, Math.max(0.35, aiConfidence * bestMat.confidence));
        if (!isCurrentResolveRun(runId)) return 'error';
        setScannedFood({
          name: bestMat.name,
          calories: bestMat.per100g?.kcal ?? 0,
          protein: bestMat.per100g?.protein_g ?? 0,
          carbs: bestMat.per100g?.carbs_g ?? 0,
          fat: bestMat.per100g?.fat_g ?? 0,
          per100g: bestMat.per100g ?? null,
          confidence: Math.round(combinedConfidenceMat * 100),
          image: prevUrlRef.current ?? undefined,
        });
        setScanState('idle');
        void storeVisualAnchorFromCurrentImage(bestMat);
        markFirstCandidateShown();
        return 'matched';
      }

      // Fallback to Open Food Facts.
      const { best, candidates: cand } = await resolveLabelOFFWithCandidates(label, {}, 3);
      if (!best) {
        if (isCurrentResolveRun(runId)) {
          setScanState('no_match');
        }
        return 'no_match';
      }

      if (cand.length > 1 && (aiConfidence * best.confidence) < 0.85) {
        if (!isCurrentResolveRun(runId)) return 'error';
        setCandidates(cand);
        setShowCandidates(true);
        markFirstCandidateShown();
        return 'candidates';
      }

      const combinedConfidence = Math.min(0.98, Math.max(0.35, aiConfidence * best.confidence));
      if (!isCurrentResolveRun(runId)) return 'error';
      setScannedFood({
        name: best.name,
        calories: best.per100g?.kcal ?? 0,
        protein: best.per100g?.protein_g ?? 0,
        carbs: best.per100g?.carbs_g ?? 0,
        fat: best.per100g?.fat_g ?? 0,
        per100g: best.per100g ?? null,
        confidence: Math.round(combinedConfidence * 100),
        image: prevUrlRef.current ?? undefined,
      });
      setScanState('idle');
      void storeVisualAnchorFromCurrentImage(best);
      markFirstCandidateShown();
      return 'matched';
    } catch (err) {
      console.error('Label resolver failed:', err);
      if (isCurrentResolveRun(runId)) {
        setScanState('no_match');
      }
      return 'error';
    } finally {
      if (isCurrentResolveRun(runId)) {
        setIsScanning(false);
      }
    }
  }

  const submitManualLabel = async () => {
    setManualError(null);
    const label = (manualLabel || '').trim();
    if (!label) {
      setManualError('Skriv inn et matnavn for å søke.');
      return;
    }

    scanMetricsRef.current.manualSearchUsed = true;
    const run = beginResolveRun();
    const outcome = await resolveLabelToScannedFood(label, run.id);
    if (outcome === 'no_match') {
      setManualError('Fant ingen treff. Prøv et annet navn.');
      return;
    }
    if (outcome === 'error') {
      setManualError('Søket feilet. Prøv igjen.');
      return;
    }
    setManualLabel('');
  };

  const selectDishSeed = async (label: string) => {
    const normalized = normalizeDishLabel(label);
    if (!normalized) return;
    scanMetricsRef.current.manualSearchUsed = false;
    const run = beginResolveRun();
    setSelectedDishSeed(normalized);
    setScanStatus(`Prioriteres: ${normalized}...`);

    const imageHash = latestImageHashRef.current;
    if (imageHash) {
      const cached = resolverSessionCacheRef.current.getBySeed(imageHash, normalized);
      if (cached) {
        if (!isCurrentResolveRun(run.id)) return;
        setScannedFood(cached);
        markFirstCandidateShown();
        return;
      }
    }

    await resolveLabelToScannedFood(normalized, run.id);
  };

  const applyCorrection = async (correctedLabel?: string) => {
    if (!scanLogId) {
      showFeedback('Ingen scan-logg for denne deteksjonen.', 'info');
      return;
    }

    setSubmittingCorrection(true);
    scanMetricsRef.current.hadCorrectionTap = true;
    const normalizedLabel = (correctedLabel ?? manualCorrectionLabel).trim();
    const chosenId = scanMetricsRef.current.resolverChosenItemId;
    const canonical = scanMetricsRef.current.ocrBrandBoostTopCanonical;
    if (scanMetricsRef.current.ocrBrandBoostUsed && canonical && chosenId) {
      addBrandAvoid(canonical, chosenId);
    }
    await sendScanFeedback({
      userConfirmed: false,
      userCorrectedTo: normalizedLabel || null,
      notFood: correctionNotFood,
      badPhoto: correctionBadPhoto,
      feedbackContext: {
        userFinalItemId: normalizedLabel ? `user:${normalizedLabel.toLowerCase()}` : null,
      },
    });
    setSubmittingCorrection(false);
    setShowCorrectionModal(false);
    setManualCorrectionLabel('');
    setCorrectionBadPhoto(false);
    setCorrectionNotFood(false);
    showFeedback('Takk! Korrigeringen er lagret for trening.', 'success');
  };

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        try { URL.revokeObjectURL(prevUrlRef.current); } catch { /* ignore */ }
      }
      stopPhotoCamera();
      stopLiveBarcodeScan();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'photo') {
      // Photo/manual detection overlays should not block barcode/search flows.
      setScanState('idle');
      setManualError(null);
      setShowCandidates(false);
      setCandidates([]);
      setScanStatus('');
    }

    if (mode === 'photo') {
      stopLiveBarcodeScan();
      if (!scannedFood && !photoCamActive) {
        void startPhotoCamera();
      }
      return;
    }

    if (mode === 'barcode') {
      stopPhotoCamera();
      if (!liveScanActive) {
        void startLiveBarcodeScan();
      }
      return;
    }

    stopPhotoCamera();
    stopLiveBarcodeScan();
  }, [mode, scannedFood, photoCamActive]);

  useEffect(() => {
    const onVisibilityChanged = () => {
      if (document.hidden) {
        stopPhotoCamera();
        stopLiveBarcodeScan();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChanged);
    return () => document.removeEventListener('visibilitychange', onVisibilityChanged);
  }, []);

  const switchLiveCamera = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      showFeedback('Kan ikke bytte kamera i denne nettleseren.', 'error');
      return;
    }

    let devices = liveDevicesRef.current;
    if (devices.length < 2) {
      const listed = await navigator.mediaDevices.enumerateDevices();
      devices = listed.filter((d) => d.kind === 'videoinput');
      liveDevicesRef.current = devices;
    }

    if (devices.length < 2) {
      showFeedback('Fant bare ett kamera.', 'info');
      return;
    }

    const activeId = activeCameraIdRef.current;
    const currentIndex = devices.findIndex((d) => d.deviceId === activeId);
    const next = devices[(currentIndex + 1 + devices.length) % devices.length];

    stopLiveBarcodeScan();
    setMode('barcode');
    await startLiveBarcodeScan(next.deviceId);
  };

  const switchPhotoCamera = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      showFeedback('Kan ikke bytte kamera i denne nettleseren.', 'error');
      return;
    }

    let devices = liveDevicesRef.current;
    if (devices.length < 2) {
      const listed = await navigator.mediaDevices.enumerateDevices();
      devices = listed.filter((d) => d.kind === 'videoinput');
      liveDevicesRef.current = devices;
    }

    if (devices.length < 2) {
      showFeedback('Fant bare ett kamera.', 'info');
      return;
    }

    const activeId = activeCameraIdRef.current;
    const currentIndex = devices.findIndex((d) => d.deviceId === activeId);
    const next = devices[(currentIndex + 1 + devices.length) % devices.length];

    stopPhotoCamera();
    setMode('photo');
    await startPhotoCamera(next.deviceId);
  };

  function calcServing(per100g: MacroNutrients | null | undefined, amount: number) {
    const f = amount / 100;
    return {
      kcal: Math.round((per100g?.kcal ?? 0) * f),
      protein_g: per100g?.protein_g != null ? Math.round(per100g.protein_g * f * 10) / 10 : undefined,
      carbs_g: per100g?.carbs_g != null ? Math.round(per100g.carbs_g * f * 10) / 10 : undefined,
      fat_g: per100g?.fat_g != null ? Math.round(per100g.fat_g * f * 10) / 10 : undefined,
    };
  }

  const perServing = scannedFood?.per100g ? calcServing(scannedFood.per100g, portionAmount) : null;

  return (
    <div className="screen">
      {feedback && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 w-[calc(100%-2rem)] max-w-md">
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              feedback.kind === 'success'
                ? 'bg-green-600 text-white'
                : feedback.kind === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-900 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{feedback.message}</span>
              {pendingUndo && (
                <button
                  onClick={undoLastAddToLog}
                  className="text-xs font-semibold underline underline-offset-2"
                >
                  Angre
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {levelUpCelebration && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-5 pointer-events-none">
          <div className="absolute inset-0 bg-black/35 levelup-overlay" />
          <div className="levelup-card relative w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl pointer-events-auto">
            <button
              onClick={() => setLevelUpCelebration(null)}
              className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-gray-700"
              aria-label="Close level up popup"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <span className="levelup-confetti levelup-confetti-a" />
              <span className="levelup-confetti levelup-confetti-b" />
              <span className="levelup-confetti levelup-confetti-c" />
              <span className="levelup-confetti levelup-confetti-d" />
            </div>
            <div className="relative text-center">
              <div className="levelup-badge mx-auto mb-3">LEVEL UP</div>
              <h3 className="text-xl font-extrabold text-gray-900">Gratulerer!</h3>
              <p className="text-sm text-gray-600 mt-1">
                Du gikk fra level {levelUpCelebration.fromLevel} til level {levelUpCelebration.toLevel}
              </p>
              <p className="text-sm font-semibold text-orange-600 mt-1">{levelUpCelebration.label}</p>
              <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-amber-500 levelup-progress"
                  style={{ width: `${Math.max(4, levelUpCelebration.nextLevelXp ? (levelUpCelebration.currentXp / levelUpCelebration.nextLevelXp) * 100 : 0)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {levelUpCelebration.currentXp}/{levelUpCelebration.nextLevelXp} XP mot neste level
              </p>
            </div>
          </div>
        </div>
      )}
      {!scannedFood ? (
        <div className="camera-container">
          {/* Camera Preview */}
          <div className="camera-preview">
            {(mode === 'barcode' || mode === 'photo') && (
              <video
                ref={mode === 'photo' ? photoVideoRef : liveVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
              />
            )}
            <div className="camera-frame">
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-8 h-8 border-l-4 border-t-4 border-orange-500 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-r-4 border-t-4 border-orange-500 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-l-4 border-b-4 border-orange-500 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-r-4 border-b-4 border-orange-500 rounded-br-xl" />
              {mode === 'barcode' && liveScanReady && (
                <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-orange-400 animate-live-scan" />
                  <div className="absolute inset-0 border border-orange-400/40 rounded-2xl animate-live-pulse" />
                </div>
              )}
              {mode === 'photo' && (
                <div className="absolute inset-[19%] rounded-xl border border-white/45 bg-black/10 pointer-events-none">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white tracking-wide">
                    OCR SONE
                  </div>
                </div>
              )}
            </div>

            {mode === 'barcode' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-2 rounded-full">
                {liveScanError
                  ? liveScanError
                  : liveScanReady
                    ? 'Rett strekkoden mot kameraet'
                    : 'Starter kamera...'}
              </div>
            )}
            {mode === 'photo' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-2 rounded-full">
                {isScanning
                  ? (scanStatus || 'Analyserer bilde...')
                  : photoCamError
                  ? photoCamError
                  : photoCamActive
                    ? (photoCamReady ? 'Trykk knappen for å ta bilde' : 'Starter kamera...')
                    : 'Trykk shutter for å starte kamera'}
              </div>
            )}

            {/* Scanning Animation */}
            {isScanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-72 h-72 border-2 border-orange-500/50 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500 animate-scan" />
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="camera-controls">
            {/* Mode Switcher */}
            <div className="camera-modes">
              <button
                onClick={() => {
                  setPhotoCamError(null);
                  setLiveScanError(null);
                  setMode('search');
                }}
                className={`camera-mode ${mode === 'search' ? 'active' : ''}`}
              >
                <Search className="w-4 h-4 inline mr-1" />
                SØK
              </button>
              <button
                onClick={() => {
                  setPhotoCamError(null);
                  setLiveScanError(null);
                  setMode('photo');
                }}
                className={`camera-mode ${mode === 'photo' ? 'active' : ''}`}
              >
                <Camera className="w-4 h-4 inline mr-1" />
                FOTO
              </button>
              <button
                onClick={async () => {
                  setPhotoCamError(null);
                  setLiveScanError(null);
                  setMode('barcode');
                }}
                className={`camera-mode ${mode === 'barcode' ? 'active' : ''}`}
              >
                <Barcode className="w-4 h-4 inline mr-1" />
                STREKKODE
              </button>
            </div>

            {/* Search Input (when in search mode) */}
            {mode === 'search' && (
              <div className="w-full px-4 flex flex-col items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Søk etter matvare..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/10 rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <FoodDetectionPanel />
              </div>
            )}

            {/* Shutter Button */}
            <button 
              onClick={handleScan}
              disabled={isScanning}
              className="shutter-button disabled:opacity-50"
            >
              {isScanning && (
                <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-orange-500 animate-spin z-10" />
              )}
            </button>

            {/* Kamerarull (camera roll) button - opens file picker */}
            <button
              onClick={() => {
                if (mode === 'photo') {
                  void capturePhotoAndAnalyze();
                  return;
                }
                openCameraRoll();
              }}
              className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center text-white font-medium text-xs"
              title="Kamerarull"
            >
              Kamerarull
            </button>

            {(mode === 'barcode' || mode === 'photo') && (
              <div className="flex gap-2">
                {mode === 'barcode' && (
                  <button
                    onClick={() => {
                      setManualBarcode('');
                      setManualBarcodeError(null);
                      setShowBarcodeEntry(true);
                    }}
                    className="px-3 py-2 rounded-md bg-white/15 text-white text-xs"
                  >
                    Manuell kode
                  </button>
                )}
                {mode === 'photo' && photoCamActive && (
                  <button
                    onClick={() => {
                      void switchPhotoCamera();
                    }}
                    className="px-3 py-2 rounded-md bg-white/15 text-white text-xs"
                  >
                    Bytt kamera
                  </button>
                )}
                {liveScanActive && (
                  <button
                    onClick={() => {
                      void switchLiveCamera();
                    }}
                    className="px-3 py-2 rounded-md bg-white/15 text-white text-xs"
                  >
                    Bytt kamera
                  </button>
                )}
                {liveScanActive && (
                  <button
                    onClick={() => {
                      stopLiveBarcodeScan();
                    }}
                    className="px-3 py-2 rounded-md bg-white/15 text-white text-xs"
                  >
                    Stopp kamera
                  </button>
                )}
              </div>
            )}

            {/* Hidden file input for camera roll */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onPickImage}
              className="hidden"
            />

            {dishPredictions.length > 0 && !scannedFood && (
              <div className="absolute left-3 right-3 bottom-24 z-[34] rounded-xl bg-white/90 p-3 shadow-md">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  {dishPredictions[0] && dishPredictions[0].confidence < 0.55 ? 'Forslag (usikkert)' : 'Top meal guesses'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {dishPredictions.slice(0, 5).map((prediction, index) => {
                    const isSelected = selectedDishSeed === prediction.label;
                    const bucket = confidenceBucket(prediction.confidence);
                    return (
                      <button
                        key={`${prediction.label}-${index}`}
                        onClick={() => { void selectDishSeed(prediction.label); }}
                        className={`px-3 py-1 rounded-full text-xs border ${
                          isSelected ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{prediction.label}</span>
                          <span className={`text-[10px] ${isSelected ? 'text-orange-100' : 'text-gray-500'}`}>
                            {bucket}
                          </span>
                          {isSelected && <span className="text-[10px] text-orange-100">prioriteres</span>}
                        </div>
                        <div className={`mt-1 h-[2px] w-full rounded-full ${isSelected ? 'bg-orange-200/50' : 'bg-gray-300'}`}>
                          <div
                            className={`h-[2px] rounded-full ${isSelected ? 'bg-white' : 'bg-orange-500'}`}
                            style={{ width: `${Math.max(8, Math.round(prediction.confidence * 100))}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual barcode modal */}
            {showBarcodeEntry && (
              <div className="absolute inset-0 z-[35] flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-white/95 rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-semibold mb-2">Skriv inn strekkode</h3>
                  <p className="text-sm text-gray-600 mb-3">Skriv EAN/UPC-koden fra pakken.</p>
                  <input
                    value={manualBarcode}
                    onChange={(e) => {
                      setManualBarcode(e.target.value.replace(/[^\d]/g, ''));
                      setManualBarcodeError(null);
                    }}
                    placeholder="f.eks. 737628064502"
                    inputMode="numeric"
                    className="w-full p-3 rounded-md border border-gray-200 mb-2"
                  />
                  {manualBarcodeError && <div className="text-sm text-red-600 mb-2">{manualBarcodeError}</div>}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowBarcodeEntry(false);
                        setManualBarcode('');
                        setManualBarcodeError(null);
                      }}
                      className="px-4 py-2 rounded-md bg-gray-200"
                    >
                      Avbryt
                    </button>
                    <button onClick={submitManualBarcode} className="px-4 py-2 rounded-md bg-orange-500 text-white">
                      Søk
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual label modal (shown when vision not configured or no match) */}
            {scanState !== 'idle' && !scannedFood && (
              <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-white/95 rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-semibold mb-2">Kan ikke gjenkjenne automatisk</h3>
                  <p className="text-sm text-gray-600 mb-3">Skriv inn hva bildet viser, så søker jeg i databasen.</p>

                  <input
                    value={manualLabel}
                    onChange={(e) => { setManualLabel(e.target.value); setManualError(null); }}
                    placeholder="f.eks. melk, eple, hamburgere"
                    className="w-full p-3 rounded-md border border-gray-200 mb-2"
                  />

                  {manualError && <div className="text-sm text-red-600 mb-2">{manualError}</div>}

                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setScanState('idle'); setManualError(null); }} className="px-4 py-2 rounded-md bg-gray-200">Avbryt</button>
                    <button onClick={submitManualLabel} className="px-4 py-2 rounded-md bg-orange-500 text-white">Søk</button>
                  </div>
                </div>
              </div>
            )}

                  {/* Candidates modal (top-3) */}
                  {showCandidates && candidates.length > 0 && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
                      <div className="w-full max-w-md bg-white rounded-xl p-4 shadow-lg">
                        <h3 className="text-lg font-semibold mb-2">Hvilken mente du?</h3>
                        <p className="text-sm text-gray-600 mb-3">Velg det som passer best.</p>
                        <div className="flex flex-col gap-2">
                          {candidates.map((c, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                scanMetricsRef.current.hadCorrectionTap = true;
                                const combinedFromDetection =
                                  c.raw && typeof c.raw === 'object' && typeof (c.raw as Record<string, unknown>).combinedConfidence === 'number'
                                    ? ((c.raw as Record<string, unknown>).combinedConfidence as number)
                                    : null;
                                const combined = combinedFromDetection ?? Math.min(0.98, Math.max(0.35, 0.8 * c.confidence));
                                setScannedFood({
                                  name: c.name,
                                  calories: c.per100g?.kcal ?? 0,
                                  protein: c.per100g?.protein_g ?? 0,
                                  carbs: c.per100g?.carbs_g ?? 0,
                                  fat: c.per100g?.fat_g ?? 0,
                                  per100g: c.per100g ?? null,
                                  confidence: Math.round(combined * 100),
                                  image: prevUrlRef.current ?? undefined,
                                });
                                const selectedFinalId = makeResolvedItemId(c);
                                const chosenId = scanMetricsRef.current.resolverChosenItemId;
                                const canonical = scanMetricsRef.current.ocrBrandBoostTopCanonical;
                                if (
                                  scanMetricsRef.current.ocrBrandBoostUsed &&
                                  canonical &&
                                  chosenId &&
                                  chosenId !== selectedFinalId
                                ) {
                                  addBrandAvoid(canonical, chosenId);
                                }
                                void sendScanFeedback({
                                  userConfirmed: false,
                                  userCorrectedTo: c.name,
                                  feedbackContext: {
                                    userFinalItemId: selectedFinalId,
                                  },
                                });
                                void storeVisualAnchorFromCurrentImage(c);
                                setShowCandidates(false);
                                setCandidates([]);
                              }}
                              className="text-left p-3 rounded-md bg-gray-100"
                            >
                              <div className="flex justify-between">
                                <div className="font-medium">{c.name}{c.brand ? ` — ${c.brand}` : ''}</div>
                                <div className="text-sm text-gray-600">{c.per100g?.kcal ?? '—'} kcal/100g</div>
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-end mt-3">
                          <button onClick={() => { setShowCandidates(false); setCandidates([]); }} className="px-4 py-2 rounded-md bg-gray-200">Avbryt</button>
                        </div>
                      </div>
                    </div>
                  )}

            {/* Recent Photos */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white">
                <img 
                  src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop" 
                  alt="Recent" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Results Screen */
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <div className="bg-white p-4 flex items-center justify-between">
            <button onClick={clearScan} className="p-2">
              <X className="w-6 h-6 text-gray-600" />
            </button>
            <h2 className="font-semibold text-gray-800">Gjenkjent mat</h2>
            <div className="w-10" />
          </div>

          {/* Food Image */}
          <div className="relative">
            <img 
              src={scannedFood.image} 
              alt={scannedFood.name}
              className="w-full h-64 object-cover"
            />
            <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {scannedFood.confidence}% sikkerhet
            </div>
          </div>

          {/* Food Details */}
          <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">{scannedFood.name}</h1>
            {scanLogId && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { void confirmCurrentPrediction(); }}
                  disabled={submittingConfirm}
                  className="text-sm px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium disabled:opacity-60"
                >
                  {submittingConfirm ? 'Lagrer...' : 'Ser riktig ut'}
                </button>
                <button
                  onClick={() => setShowCorrectionModal(true)}
                  className="text-sm px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-medium"
                >
                  Feil gjenkjenning? Korriger
                </button>
              </div>
            )}
            {scanLogId && predictionOptions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Velg riktig forslag:</p>
                <div className="flex flex-wrap gap-2">
                  {predictionOptions.slice(0, 4).map((option, idx) => (
                    <button
                      key={`${option.label}-${idx}`}
                      onClick={() => { void applyCorrection(option.label); }}
                      className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nutrition Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-gray-800">{scannedFood.calories}</p>
                <p className="text-sm text-gray-500">kcal</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{scannedFood.protein}g</p>
                <p className="text-sm text-blue-500">protein</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{scannedFood.carbs}g</p>
                <p className="text-sm text-green-500">karbo</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{scannedFood.fat}g</p>
                <p className="text-sm text-orange-500">fett</p>
              </div>
            </div>

            {/* Portion picker */}
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">Portion</p>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(portionAmount)}
                  onChange={(e) => setPortionAmount(Number(String(e.target.value).replace(/[^0-9]/g, '')) || 0)}
                  className="flex-1 bg-white/5 text-white p-3 rounded-lg outline-none"
                  placeholder="100"
                />

                <button
                  onClick={() => setPortionUnit((u) => (u === 'g' ? 'ml' : 'g'))}
                  className="bg-white/5 text-white px-4 py-2 rounded-lg"
                >
                  {portionUnit}
                </button>
              </div>

              {perServing && (
                <div className="mt-4">
                  <p className="text-white text-lg font-semibold">Per {portionAmount}{portionUnit}</p>
                  <p className="text-white">{perServing.kcal} kcal</p>
                  <p className="text-white">{perServing.protein_g ?? '—'} g protein</p>
                  <p className="text-white">{perServing.carbs_g ?? '—'} g carbs</p>
                  <p className="text-white">{perServing.fat_g ?? '—'} g fat</p>
                </div>
              )}

            </div>

            {/* Add Button */}
            <button 
              onClick={addToLog}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mt-4"
            >
              <Check className="w-5 h-5" />
              Legg til i dagbok
            </button>
          </div>

          {showCorrectionModal && scanLogId && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/30">
              <div className="w-full max-w-md bg-white rounded-xl p-4 shadow-lg">
                <h3 className="text-lg font-semibold mb-2">Korriger resultat</h3>
                <p className="text-sm text-gray-600 mb-3">Velg riktig vare eller skriv inn manuelt.</p>
                {predictionOptions.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {predictionOptions.map((option, idx) => (
                      <button
                        key={`${option.label}-${idx}`}
                        onClick={() => { void applyCorrection(option.label); }}
                        disabled={submittingCorrection}
                        className="text-left p-2 rounded-md bg-gray-100 text-sm"
                      >
                        {option.label} ({Math.round(option.confidence * 100)}%)
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={manualCorrectionLabel}
                  onChange={(e) => setManualCorrectionLabel(e.target.value)}
                  placeholder="Skriv riktig navn"
                  className="w-full p-3 rounded-md border border-gray-200 mb-3"
                />
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={correctionNotFood}
                    onChange={(e) => setCorrectionNotFood(e.target.checked)}
                  />
                  Ikke mat / ignorer
                </label>
                <label className="flex items-center gap-2 text-sm mb-4">
                  <input
                    type="checkbox"
                    checked={correctionBadPhoto}
                    onChange={(e) => setCorrectionBadPhoto(e.target.checked)}
                  />
                  Dårlig bilde
                </label>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowCorrectionModal(false)}
                    className="px-4 py-2 rounded-md bg-gray-200"
                    disabled={submittingCorrection}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={() => { void applyCorrection(); }}
                    className="px-4 py-2 rounded-md bg-orange-500 text-white"
                    disabled={submittingCorrection}
                  >
                    {submittingCorrection ? 'Lagrer...' : 'Lagre'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(288px); }
        }
        @keyframes liveScan {
          0% { transform: translateY(0); opacity: 0.85; }
          50% { opacity: 1; }
          100% { transform: translateY(276px); opacity: 0.85; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.85; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
        .animate-live-scan {
          animation: liveScan 1.8s ease-in-out infinite;
        }
        .animate-live-pulse {
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes levelupOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes levelupCardIn {
          0% { transform: translateY(18px) scale(0.92); opacity: 0; }
          70% { transform: translateY(-3px) scale(1.02); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes levelupBadgePop {
          0% { transform: scale(0.7) rotate(-8deg); opacity: 0; }
          65% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes levelupConfetti {
          0% { transform: translateY(-140%) rotate(0deg); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(360%) rotate(240deg); opacity: 0; }
        }
        .levelup-overlay {
          animation: levelupOverlay 180ms ease-out;
        }
        .levelup-card {
          animation: levelupCardIn 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
        }
        .levelup-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0.45rem 0.9rem;
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          color: #fff;
          background: linear-gradient(135deg, #fb923c, #f59e0b);
          animation: levelupBadgePop 430ms ease-out;
        }
        .levelup-confetti {
          position: absolute;
          width: 10px;
          height: 16px;
          border-radius: 2px;
          animation: levelupConfetti 1.7s ease-out forwards;
        }
        .levelup-confetti-a { left: 18%; background: #f97316; animation-delay: 0ms; }
        .levelup-confetti-b { left: 34%; background: #22c55e; animation-delay: 120ms; }
        .levelup-confetti-c { left: 62%; background: #0ea5e9; animation-delay: 60ms; }
        .levelup-confetti-d { left: 78%; background: #eab308; animation-delay: 180ms; }
        .levelup-progress {
          transform-origin: left center;
        }
      `}</style>
    </div>
  );
}







