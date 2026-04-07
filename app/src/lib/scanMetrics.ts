import type { OcrPreprocessMode } from '../components/screens/browserOcr';
import type { ResolverSeedSource } from '../components/screens/scanFlowUtils';

export type ScanMetrics = {
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
  adaptiveRankingEnabled: boolean | null;
  adaptiveRankingKillSwitch: boolean | null;
  adaptiveRankingGeneratedAt: string | null;
  adaptiveRankingApplied: boolean | null;
  adaptiveRankingAdjustedCount: number | null;
  frontVisibilityScore: number | null;
  selectedFrameQuality: number | null;
  selectedFrameSharpness: number | null;
  selectedFrameGlare: number | null;
  selectedFrameBrightness: number | null;
  packagingType: string | null;
  topMatchConfidence: number | null;
  topMatchMargin: number | null;
  ocrStrategy: string | null;
  shouldPromptRetake: boolean | null;
};

export function createInitialScanMetrics(): ScanMetrics {
  return {
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
    adaptiveRankingEnabled: null,
    adaptiveRankingKillSwitch: null,
    adaptiveRankingGeneratedAt: null,
    adaptiveRankingApplied: null,
    adaptiveRankingAdjustedCount: null,
    frontVisibilityScore: null,
    selectedFrameQuality: null,
    selectedFrameSharpness: null,
    selectedFrameGlare: null,
    selectedFrameBrightness: null,
    packagingType: null,
    topMatchConfidence: null,
    topMatchMargin: null,
    ocrStrategy: null,
    shouldPromptRetake: null,
  };
}
