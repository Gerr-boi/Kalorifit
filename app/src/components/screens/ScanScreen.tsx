import React, { useState, useRef, useEffect } from 'react';
import { Search, Camera, Barcode, X, Check, Loader2 } from 'lucide-react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { resolveBarcode } from '../../ai-scanner-logic/nutritionResolver';
import { resolveLabelOFFWithCandidates } from '../../ai-scanner-logic/labelResolver';
import { resolveLabelMatvaretabellen } from '../../ai-scanner-logic/matvaretabellen';
import type { NutritionResult } from '../../ai-scanner-logic/types';
import type { MacroNutrients } from '../../ai-scanner-logic/types';
import { createEmptyDayLog, toDateKey, type DayLog, type FoodEntry, type MealId } from '../../lib/disciplineEngine';
import FoodDetectionPanel from '../food/FoodDetectionPanel';

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
type TimedOutMarker = { timedOut: true };
type ScanFeedbackPayload = {
  userConfirmed?: boolean;
  userCorrectedTo?: string | null;
  notFood?: boolean;
  badPhoto?: boolean;
  feedbackNotes?: string;
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
type ScanVideoConstraints = {
  facingMode?: { ideal: 'environment' | 'user' };
  deviceId?: { exact: string };
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export default function ScanScreen() {
  const MAX_VISION_WAIT_MS = 30000;
  const MAX_RESOLVER_WAIT_MS = 7500;
  const MAX_TOTAL_MATCH_WAIT_MS = 18000;
  const MAX_IMAGE_DIMENSION = 1280;
  const JPEG_QUALITY = 0.82;
  const VISUAL_ANCHOR_STORAGE_KEY = 'kalorifit.visual_anchors.v1';
  const MAX_VISUAL_ANCHORS = 40;
  const [mode, setMode] = useState<ScanMode>('photo');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [portionAmount, setPortionAmount] = useState<number>(100);
  const [portionUnit, setPortionUnit] = useState<'g' | 'ml'>('g');
  const [feedback, setFeedback] = useState<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [showBarcodeEntry, setShowBarcodeEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualBarcodeError, setManualBarcodeError] = useState<string | null>(null);
  const [scanLogId, setScanLogId] = useState<string | null>(null);
  const [predictionOptions, setPredictionOptions] = useState<VisionPrediction[]>([]);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [manualCorrectionLabel, setManualCorrectionLabel] = useState('');
  const [correctionNotFood, setCorrectionNotFood] = useState(false);
  const [correctionBadPhoto, setCorrectionBadPhoto] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
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

  function getDeviceInfo() {
    const nav = window.navigator;
    return `${nav.platform || 'unknown'} | ${nav.userAgent}`;
  }

  function createScanRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `scan-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
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

  function normalizeAnchorId(input: string) {
    return input.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  }

  function loadVisualAnchors(): VisualAnchor[] {
    try {
      const raw = window.localStorage.getItem(VISUAL_ANCHOR_STORAGE_KEY);
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
      window.localStorage.setItem(VISUAL_ANCHOR_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_VISUAL_ANCHORS)));
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
       const outcome = await resolveLabelToScannedFood(label);
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
    setPredictionOptions([]);
    setShowCorrectionModal(false);
    setManualCorrectionLabel('');
    setCorrectionBadPhoto(false);
    setCorrectionNotFood(false);
  }

  async function sendScanFeedback(payload: ScanFeedbackPayload) {
    if (!scanLogId) return;
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
        }),
      });
    } catch (err) {
      console.warn('Failed to submit scan feedback:', err);
    }
  }

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
      const storageKey = 'home.dailyLogs.v2';
      const todayKey = toDateKey(new Date());
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Record<string, DayLog>) : {};
      const dayLog = parsed[todayKey] ?? createEmptyDayLog();
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
      window.localStorage.setItem(storageKey, JSON.stringify({ ...parsed, [todayKey]: nextDayLog }));
      window.localStorage.setItem('home.lastLoggedFood.v1', JSON.stringify(loggedEntry));
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
    clearScan();
  };

  // Camera roll / file picker support
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  const openCameraRoll = () => {
    fileInputRef.current?.click();
  };
const barcodeInFlightRef = useRef(false);
const lastHandledRef = useRef<{ code: string; at: number } | null>(null);
const stableCountsRef = useRef(new Map<string, { count: number; lastAt: number }>());

function normalizeBarcode(code: string) {
  return code.replace(/\s+/g, "").trim();
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

  // Stability: require 3 hits in ~1.2s (reduces false reads)
  const m = stableCountsRef.current;
  const prev = m.get(normalized);
  const next = !prev || now - prev.lastAt > 1200
    ? { count: 1, lastAt: now }
    : { count: prev.count + 1, lastAt: now };

  m.set(normalized, next);

  if (next.count < 3) return null;

  // reset counter once accepted
  m.delete(normalized);
  return normalized;
}

function stopLiveBarcodeScan() {
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
    liveVideoRef.current.srcObject = null;
  }

  if (zxingControlsRef.current) {
    zxingControlsRef.current.stop();
    zxingControlsRef.current = null;
  }
  liveDetectorRef.current = null;

  detectInProgressRef.current = false;
  setLiveScanReady(false);
  setLiveScanActive(false);
}

function stopPhotoCamera() {
  if (photoStreamRef.current) {
    photoStreamRef.current.getTracks().forEach((track) => track.stop());
    photoStreamRef.current = null;
  }

  if (photoVideoRef.current) {
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
    setPhotoCamReady(true);
    setPhotoCamActive(true);
  } catch (err) {
    console.error('Failed to start photo camera:', err);
    setPhotoCamError('Kunne ikke starte kamera. Sjekk kameratillatelse.');
    stopPhotoCamera();
  }
}

async function scanLoop() {
  const video = liveVideoRef.current;
  const detector = liveDetectorRef.current;

  if (!video || !liveScanEnabledRef.current) return;
  if (!detector) return;

  if (!detectInProgressRef.current && video.readyState >= 2) {
    detectInProgressRef.current = true;
    try {
      const results = await detector.detect(video);
      const rawValue = results?.[0]?.rawValue;
      if (rawValue) await handleBarcodeDetected(rawValue, true);
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

  try {
    setLiveScanError(null);
    setLiveScanReady(false);
    liveDetectorRef.current = window.BarcodeDetector
      ? new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
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

    cameraHints.push({ facingMode: { ideal: 'environment' } });
    cameraHints.push({ facingMode: { ideal: 'user' } });

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

    liveStreamRef.current = stream;
    const activeTrack = stream.getVideoTracks()[0];
    const activeSettings = activeTrack?.getSettings();
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
    setLiveScanReady(true);
    if (!liveDetectorRef.current) {
      setLiveScanError('Kamera aktiv. Bruker JS-skanner fallback for desktop/nettleser.');
    }
    liveScanEnabledRef.current = true;
    setLiveScanActive(true);
    if (liveDetectorRef.current) {
      liveRafRef.current = window.requestAnimationFrame(scanLoop);
    } else {
      if (!zxingReaderRef.current) {
        zxingReaderRef.current = new BrowserMultiFormatReader();
      }
      zxingControlsRef.current = await zxingReaderRef.current.decodeFromVideoElement(
        video,
        (result) => {
          const rawValue = result?.getText();
          if (!rawValue) return;
          void handleBarcodeDetected(rawValue, true);
        }
      );
    }
  } catch (err) {
    console.error('Failed to start live barcode scan:', err);
    setLiveScanError('Kunne ikke starte kamera. Sjekk kameratillatelse.');
    stopLiveBarcodeScan();
  }
}

async function handleBarcodeDetected(rawCode: string, requireStableRead = true) {
  const code = requireStableRead ? shouldHandleBarcode(rawCode) : normalizeBarcode(rawCode);
  if (!code) {
    if (!requireStableRead) setManualBarcodeError('Ugyldig strekkode.');
    return;
  }

  if (barcodeInFlightRef.current) return;
  barcodeInFlightRef.current = true;

  try {
    setIsScanning(true);
    setScanState("idle");

    const result = await resolveBarcode(code);
    if (!result) {
      showFeedback("Fant ingen produkt for strekkoden. Prov foto eller manuelt sok.", 'error');
      return;
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
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
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

async function tryDecodeBarcodeFromBlob(blob: Blob): Promise<string | null> {
  const angles: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
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

  const [scanState, setScanState] = useState<'idle' | 'needs_manual_label' | 'no_match'>('idle');
  const [manualLabel, setManualLabel] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<NutritionResult[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);

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
    sourceBlob?: Blob
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
        items?: Array<{ name?: string; confidence?: number }>;
        detections?: Array<{ label?: string; confidence?: number }>;
        text_detections?: Array<{ text?: string; confidence?: number }>;
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
      if (modelId.includes('dummy')) {
        throw new Error('DUMMY_PROVIDER_MODE');
      }

      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const detections = Array.isArray(parsed?.detections) ? parsed.detections : [];
      const textDetections = Array.isArray(parsed?.text_detections) ? parsed.text_detections : [];
      const predictionsFromItems = items.map((item: { name?: string; confidence?: number }) => ({
        label: item?.name ?? '',
        confidence: typeof item?.confidence === 'number' ? item.confidence : 0,
      }));
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
        const parts = cleaned.split(' ').filter((token) => token.length > 2);
        const labels = [cleaned, ...parts];
        return labels.map((label) => ({
          label,
          confidence: Math.max(0.2, Math.min(0.75, conf)),
        }));
      });

      // Priority: dictionary-ranked items first, then detector/OCR fallbacks.
      const mergedPredictions = [...predictionsFromItems, ...predictionsFromDetections, ...predictionsFromText]
        .filter((entry) => entry.label && entry.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8);

      if (!mergedPredictions.length) return null;

      const best = mergedPredictions[0] as { label?: string; confidence?: number };
      const parsedScanLogId = typeof parsed?.scan_log_id === 'string'
        ? parsed.scan_log_id
        : (typeof parsed?.meta?.scanLogId === 'string' ? parsed.meta.scanLogId : null);
      return {
        label: best?.label ?? '',
        confidence: typeof best?.confidence === 'number' ? best.confidence : 0,
        predictions: mergedPredictions,
        scanLogId: parsedScanLogId,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('SCAN_TIMEOUT');
      }
      console.warn('Vision detect failed:', err);
      throw err;
    }
  }

  const processImageForNutrition = async (
    url: string,
    trace: ScanTrace,
    blobForVision?: Blob,
    originalBlobForBarcode?: Blob
  ) => {
    setIsScanning(true);
    setScanState('idle');
    setScanStatus('Analyserer bilde...');
    activeScanTraceRef.current = trace;

    try {
      const rawAIResult = await runVisionOnImage(url, trace, blobForVision);
      const rawResultObject = rawAIResult && typeof rawAIResult === 'object'
        ? (rawAIResult as { scanLogId?: unknown })
        : null;
      const nextScanLogId = typeof rawResultObject?.scanLogId === 'string' ? rawResultObject.scanLogId : null;
      setScanLogId(nextScanLogId);

      console.log('AI raw response:', rawAIResult);

      const predictions = extractPredictionsFromAI(rawAIResult, 3);
      setPredictionOptions(predictions.slice(0, 5));
      trace.mark('RESULT_PARSED', { predictionCount: predictions.length });
      if (!predictions.length) {
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

      if (detectChocolateMilkHint(predictions)) {
        setScanStatus('Soker etter sjokolademelk...');
        const direct = await withTimeout(resolveLabelOFFWithCandidates('sjokolademelk', {}, 3), MAX_RESOLVER_WAIT_MS);
        if (!isTimedOut(direct) && direct.best) {
          const aiConfidence = Math.max(...predictions.map((p) => p.confidence), 0.55);
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
          trace.mark('UI_UPDATED', {
            outcome: 'chocolate_milk_direct_match',
            resolvedName: direct.best.name,
          });
          return;
        }
      }

      setScanStatus('Soker i matdatabaser...');

      const rankedResult = await withTimeout(
        (async () => {
          const resolvedEntries = await Promise.all(
            predictions.slice(0, 2).map(async (prediction) => {
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

      if (isTimedOut(rankedResult) || rankedResult.length === 0) {
        setScanState('needs_manual_label');
        setManualLabel('');
        showFeedback('Oppslag tok for lang tid. Prover manuell sok.', 'info');
        trace.mark('UI_UPDATED', { outcome: 'resolver_timeout_manual_label' });
        return;
      }

      const bestResolved = rankedResult[0];
      const secondResolved = rankedResult[1];

      if (secondResolved && (bestResolved.combined - secondResolved.combined) < 0.07) {
        setCandidates(rankedResult.slice(0, 3).map((x) => ({ ...x.item, confidence: x.combined })));
        setShowCandidates(true);
        trace.mark('UI_UPDATED', {
          outcome: 'ambiguous_show_candidates',
          candidateCount: Math.min(3, rankedResult.length),
        });
        return;
      }

      const best = bestResolved.item;
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
      trace.mark('UI_UPDATED', {
        outcome: 'success',
        resolvedName: best.name,
      });
      noPredictionCountRef.current = 0;
    } catch (err) {
      const dummyMode = err instanceof Error && err.message === 'DUMMY_PROVIDER_MODE';
      const timedOut = err instanceof Error && err.message === 'SCAN_TIMEOUT';
      if (dummyMode) {
        setScanState('needs_manual_label');
        setManualLabel('');
        showFeedback('Bildegjenkjenning kjører i dummy-modus. Sett PROVIDER=yolo i food_detection_bot/.env for ekte deteksjon.', 'info');
      } else if (timedOut) {
        showFeedback('Scan timed out. Please retry.', 'error');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Skanning feilet. Prov igjen.';
        showFeedback(errorMessage, 'error');
      }
      trace.mark('UI_UPDATED', {
        outcome: dummyMode ? 'dummy_mode_manual_label' : timedOut ? 'scan_timeout_error' : 'scan_error',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
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

  async function resolveLabelToScannedFood(labelInput: string): Promise<LabelResolveOutcome> {
    const label = labelInput.trim();
    if (!label) return 'no_match';

    setIsScanning(true);
    try {
      const aiConfidence = 0.8;
      // Try Matvaretabellen first for Norwegian foods.
      const mat = await resolveLabelMatvaretabellen(label);
      if (mat && mat.best) {
        const bestMat = mat.best;
        if (mat.candidates.length > 1 && (aiConfidence * bestMat.confidence) < 0.85) {
          setCandidates(mat.candidates);
          setShowCandidates(true);
          return 'candidates';
        }

        const combinedConfidenceMat = Math.min(0.98, Math.max(0.35, aiConfidence * bestMat.confidence));
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
        return 'matched';
      }

      // Fallback to Open Food Facts.
      const { best, candidates: cand } = await resolveLabelOFFWithCandidates(label, {}, 3);
      if (!best) {
        setScanState('no_match');
        return 'no_match';
      }

      if (cand.length > 1 && (aiConfidence * best.confidence) < 0.85) {
        setCandidates(cand);
        setShowCandidates(true);
        return 'candidates';
      }

      const combinedConfidence = Math.min(0.98, Math.max(0.35, aiConfidence * best.confidence));
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
      return 'matched';
    } catch (err) {
      console.error('Label resolver failed:', err);
      setScanState('no_match');
      return 'error';
    } finally {
      setIsScanning(false);
    }
  }

  const submitManualLabel = async () => {
    setManualError(null);
    const label = (manualLabel || '').trim();
    if (!label) {
      setManualError('Skriv inn et matnavn for å søke.');
      return;
    }

    const outcome = await resolveLabelToScannedFood(label);
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

  const applyCorrection = async (correctedLabel?: string) => {
    if (!scanLogId) {
      showFeedback('Ingen scan-logg for denne deteksjonen.', 'info');
      return;
    }

    setSubmittingCorrection(true);
    const normalizedLabel = (correctedLabel ?? manualCorrectionLabel).trim();
    await sendScanFeedback({
      userConfirmed: false,
      userCorrectedTo: normalizedLabel || null,
      notFood: correctionNotFood,
      badPhoto: correctionBadPhoto,
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
            {feedback.message}
          </div>
        </div>
      )}
      {!scannedFood ? (
        <div className="camera-container">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
                <span className="text-2xl">👩‍🍳</span>
                <span className="text-white font-medium">26 Day Streak</span>
                <span className="text-white/60">{'>'}</span>
              </div>
              <button className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">⚡</span>
              </button>
            </div>
          </div>

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

            {mode === 'barcode' && (
              <div className="flex gap-2">
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
              <button
                onClick={() => setShowCorrectionModal(true)}
                className="mb-4 text-sm text-orange-600 font-medium"
              >
                Feil gjenkjenning? Korriger med ett trykk
              </button>
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
      `}</style>
    </div>
  );
}




