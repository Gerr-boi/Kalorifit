import type { MutableRefObject } from 'react';
import { postScanFeedback } from '../lib/scanApi';
import type { ScanMetrics } from '../lib/scanMetrics';
import type { OcrPreprocessMode } from '../components/screens/browserOcr';
import type { ResolverSeedSource } from '../components/screens/scanFlowUtils';

type VisionPrediction = { label: string; confidence: number };

type ScannedFoodFeedbackItem = {
  name: string;
};

type ScanTraceLike = {
  scanRequestId: string;
};

export type ScanFeedbackPayload = {
  userConfirmed?: boolean;
  userCorrectedTo?: string | null;
  correctedDetection?: {
    label?: string | null;
    bbox?: [number, number, number, number] | null;
  } | null;
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
    frontVisibilityScore?: number | null;
    selectedFrameQuality?: number | null;
    selectedFrameSharpness?: number | null;
    selectedFrameGlare?: number | null;
    selectedFrameBrightness?: number | null;
    packagingType?: string | null;
    topMatchConfidence?: number | null;
    topMatchMargin?: number | null;
    ocrStrategy?: string | null;
    shouldPromptRetake?: boolean | null;
    adaptiveRankingEnabled?: boolean | null;
    adaptiveRankingKillSwitch?: boolean | null;
    adaptiveRankingGeneratedAt?: string | null;
    adaptiveRankingApplied?: boolean | null;
    adaptiveRankingAdjustedCount?: number | null;
  };
};

type UseScanFeedbackOptions = {
  scanLogId: string | null;
  scannedFood: ScannedFoodFeedbackItem | null;
  dishPredictions: VisionPrediction[];
  activeScanTraceRef: MutableRefObject<ScanTraceLike | null>;
  selectedDishSeedRef: MutableRefObject<string | null>;
  latestImageHashRef: MutableRefObject<string | null>;
  scanMetricsRef: MutableRefObject<ScanMetrics>;
  createScanRequestId: () => string;
  makeResolvedItemId: (input: { source: string; name: string; brand: string }) => string;
  showFeedback: (message: string, type: 'success' | 'error' | 'info') => void;
  setSubmittingConfirm: (value: boolean) => void;
  setFeedbackSubmitted: (value: boolean) => void;
};

export function useScanFeedback({
  scanLogId,
  scannedFood,
  dishPredictions,
  activeScanTraceRef,
  selectedDishSeedRef,
  latestImageHashRef,
  scanMetricsRef,
  createScanRequestId,
  makeResolvedItemId,
  showFeedback,
  setSubmittingConfirm,
  setFeedbackSubmitted,
}: UseScanFeedbackOptions) {
  async function sendScanFeedback(payload: ScanFeedbackPayload): Promise<boolean> {
    if (!scanLogId) return false;
    const topPredictions = dishPredictions.slice(0, 5).map((entry) => ({
      label: entry.label,
      prob: Number(entry.confidence.toFixed(4)),
    }));
    const inferredFinalId = payload.userCorrectedTo
      ? `user:${payload.userCorrectedTo.trim().toLowerCase()}`
      : (scannedFood ? makeResolvedItemId({ source: 'resolved', name: scannedFood.name, brand: '' }) : null);

    try {
      await postScanFeedback(
        scanLogId,
        {
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
            frontVisibilityScore: scanMetricsRef.current.frontVisibilityScore,
            selectedFrameQuality: scanMetricsRef.current.selectedFrameQuality,
            selectedFrameSharpness: scanMetricsRef.current.selectedFrameSharpness,
            selectedFrameGlare: scanMetricsRef.current.selectedFrameGlare,
            selectedFrameBrightness: scanMetricsRef.current.selectedFrameBrightness,
            packagingType: scanMetricsRef.current.packagingType,
            topMatchConfidence: scanMetricsRef.current.topMatchConfidence,
            topMatchMargin: scanMetricsRef.current.topMatchMargin,
            ocrStrategy: scanMetricsRef.current.ocrStrategy,
            shouldPromptRetake: scanMetricsRef.current.shouldPromptRetake,
            adaptiveRankingEnabled: scanMetricsRef.current.adaptiveRankingEnabled,
            adaptiveRankingKillSwitch: scanMetricsRef.current.adaptiveRankingKillSwitch,
            adaptiveRankingGeneratedAt: scanMetricsRef.current.adaptiveRankingGeneratedAt,
            adaptiveRankingApplied: scanMetricsRef.current.adaptiveRankingApplied,
            adaptiveRankingAdjustedCount: scanMetricsRef.current.adaptiveRankingAdjustedCount,
            ...(payload.feedbackContext ?? {}),
          },
        },
        activeScanTraceRef.current?.scanRequestId ?? createScanRequestId()
      );
      setFeedbackSubmitted(true);
      return true;
    } catch (err) {
      console.warn('Failed to submit scan feedback:', err);
      showFeedback('Kunne ikke lagre skann-feedback. Proev igjen før du avslutter.', 'error');
      return false;
    }
  }

  async function confirmCurrentPrediction() {
    if (!scanLogId || !scannedFood) return;
    setSubmittingConfirm(true);
    const ok = await sendScanFeedback({
      userConfirmed: true,
      userCorrectedTo: scannedFood.name ?? null,
      feedbackContext: {
        userFinalItemId: makeResolvedItemId({ source: 'confirmed', name: scannedFood.name, brand: '' }),
      },
    });
    setSubmittingConfirm(false);
    if (ok) {
      showFeedback('Takk! Bekreftelsen er lagret.', 'success');
    }
  }

  return {
    sendScanFeedback,
    confirmCurrentPrediction,
  };
}
