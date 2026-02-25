type OCRWorker = {
  reinitialize: (langs?: string | string[]) => Promise<unknown>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: Blob | string | ImageData,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ) => Promise<{
    data?: {
      text?: string;
      blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ text?: string; confidence?: number }> }> }>;
    };
  }>;
};

const DEFAULT_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';
const NOISE_WORDS = new Set([
  'naring',
  'innhold',
  'ingredienser',
  'ingredienser:',
  'ingredients',
  'best',
  'before',
  'dato',
  'utlop',
  'batch',
  'lot',
  'netto',
  'weight',
  'vekt',
  'oppbevares',
  'storage',
  'kcal',
  'kj',
  'protein',
  'fett',
  'karbohydrat',
  'carbohydrate',
  'pa',
  'på',
  'av',
  'og',
  'for',
  'til',
  'med',
  'uten',
]);

export type BrandBoostHit = {
  canonical: string;
  score: number;
  matched: string[];
};

const BRAND_RULES: Array<{
  canonical: string;
  patterns: RegExp[];
  seeds: string[];
}> = [
  {
    canonical: 'coca cola',
    patterns: [
      /\bcoca\b/i,
      /\bco\s*ca\b/i,
      /\bcoc[ao]\b/i,
      /\bcocac[0o]la\b/i,
      /\bcola\b/i,
      /\bcoca[\s-]*cola\b/i,
      /\bcola\s*cola\b/i,
      /\bc0ca\b/i,
      /\bc0la\b/i,
      /\bcoke\b/i,
      /\bkok(e|a|i)\b/i,
      /\bco[kx]e\b/i,
      /\bclassic\b/i,
      /\boriginal\b/i,
      /\boriginal(\s*taste)?\b/i,
      /\bzero\b/i,
      /\bzero\s*sugar\b/i,
      /\bsukkerfri\b/i,
      /\buten\s*sukker\b/i,
      /\bno\s*sugar\b/i,
    ],
    seeds: [
      'coca cola',
      'coca-cola',
      'cola',
      'coca cola zero',
      'coca cola uten sukker',
      'coca cola original taste',
      'coca cola original',
    ],
  },
  {
    canonical: 'pepsi',
    patterns: [
      /\bpepsi\b/i,
      /\bpeps[i1]\b/i,
      /\bpep(si|s1)\b/i,
      /\bpep5i\b/i,
      /\bpepxi\b/i,
    ],
    seeds: ['pepsi', 'pepsi max', 'pepsi regular', 'pepsi zero', 'pepsi zero sugar', 'pepsi uten sukker'],
  },
  {
    canonical: 'monster energy',
    patterns: [/\bmonster\b/i, /\bmonst(er|3r)\b/i, /\benerg(y|i)\b/i],
    seeds: ['monster', 'monster energy', 'monster ultra'],
  },
  {
    canonical: 'red bull',
    patterns: [/\bred\b/i, /\bbull\b/i, /\bredbull\b/i, /\bred\s*bull\b/i],
    seeds: ['red bull', 'red bull sukkerfri', 'red bull zero'],
  },
  {
    canonical: 'urge',
    patterns: [/\burge\b/i, /\burg[e3]\b/i, /\butge\b/i, /\burg\b/i],
    seeds: ['urge', 'urge original', 'urge uten sukker'],
  },
];

const SHORT_TOKEN_WHITELIST = new Set(['pe', 'co', 'ur']);
const FRAGMENT_RULES: Array<{ canonical: string; prefixes: string[] }> = [
  { canonical: 'coca cola', prefixes: ['co', 'coc', 'coca', 'col', 'cola', 'koke'] },
  { canonical: 'pepsi', prefixes: ['pep', 'peps', 'pepx'] },
  { canonical: 'urge', prefixes: ['ur', 'urg', 'urge'] },
];

type BrandBoostOptions = {
  bestLineScore?: number;
  textCharCount?: number;
};

export type OcrPreprocessOpts = {
  enableThreshold?: boolean;
  threshold?: number;
  contrast?: number;
  denoise?: boolean;
  autoThresholdQuantile?: number;
};

export type OcrPreprocessMode = 'normal' | 'aggressive';
export type OcrTextStats = {
  lettersCount: number;
  digitsCount: number;
  charCount: number;
};

const DEFAULT_PREPROCESS_OPTS: Required<OcrPreprocessOpts> = {
  enableThreshold: true,
  threshold: 0,
  contrast: 1.35,
  denoise: false,
  autoThresholdQuantile: 0.55,
};

let workerPromise: Promise<OCRWorker> | null = null;
let currentLang = '';

export function pickOcrLang(locale: string) {
  const l = String(locale ?? '').toLowerCase();
  if (l.startsWith('nb') || l.startsWith('nn') || l.startsWith('no') || l.endsWith('-no')) return 'nor+eng';
  return 'eng';
}

async function getWorker(locale = 'en-US', langPath = DEFAULT_LANG_PATH): Promise<OCRWorker> {
  const targetLang = pickOcrLang(locale);
  if (!workerPromise) {
    workerPromise = (async () => {
      const mod = await import('tesseract.js');
      const worker = (await mod.createWorker(targetLang, 1, {
        langPath,
        logger: () => {},
      })) as OCRWorker;
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });
      currentLang = targetLang;
      return worker;
    })();
  }
  const worker = await workerPromise;
  if (currentLang !== targetLang) {
    await worker.reinitialize(targetLang);
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    });
    currentLang = targetLang;
  }
  return worker;
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('OCR image decode failed'));
    };
    img.src = url;
  });
}

export async function cropCenterForOCR(blob: Blob, boxRatio = 0.62): Promise<Blob> {
  const img = await loadImage(blob);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const cropW = Math.max(1, Math.round(width * boxRatio));
  const cropH = Math.max(1, Math.round(height * boxRatio));
  const sx = Math.max(0, Math.round((width - cropW) / 2));
  const sy = Math.max(0, Math.round((height - cropH) / 2));

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  return out ?? blob;
}

function clamp255(n: number) {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
}

function createImageDataSafe(width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(width, height);
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

export function preprocessForOcr(input: ImageData, opts?: OcrPreprocessOpts): ImageData {
  const o = { ...DEFAULT_PREPROCESS_OPTS, ...(opts ?? {}) };
  const { width, height, data } = input;
  const out = createImageDataSafe(width, height);
  const output = out.data;
  const gray = new Uint8ClampedArray(width * height);
  let min = 255;
  let max = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    gray[p] = y;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  const range = Math.max(1, max - min);
  for (let p = 0; p < gray.length; p += 1) {
    let y = ((gray[p] - min) * 255) / range;
    y = (y - 128) * o.contrast + 128;
    gray[p] = clamp255(y);
  }

  if (o.denoise) {
    const tmp = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        const prev = gray[row + Math.max(0, x - 1)];
        const cur = gray[idx];
        const next = gray[row + Math.min(width - 1, x + 1)];
        tmp[idx] = ((prev + cur + next) / 3) | 0;
      }
    }
    gray.set(tmp);
  }

  let thr = Math.max(0, Math.min(255, o.threshold));
  if (o.enableThreshold && thr === 0) {
    const hist = new Uint32Array(256);
    for (let p = 0; p < gray.length; p += 1) hist[gray[p]] += 1;
    const total = gray.length;
    const quantile = Math.max(0.05, Math.min(0.95, o.autoThresholdQuantile));
    let acc = 0;
    for (let i = 0; i < 256; i += 1) {
      acc += hist[i];
      if (acc >= total * quantile) {
        thr = i;
        break;
      }
    }
  }

  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    const y = gray[p];
    const v = o.enableThreshold ? (y >= thr ? 255 : 0) : y;
    output[i] = v;
    output[i + 1] = v;
    output[i + 2] = v;
    output[i + 3] = 255;
  }

  return out;
}

export function getOcrPreprocessPreset(mode: OcrPreprocessMode): Required<OcrPreprocessOpts> {
  if (mode === 'aggressive') {
    return {
      enableThreshold: true,
      threshold: 0,
      contrast: 1.6,
      denoise: true,
      autoThresholdQuantile: 0.62,
    };
  }
  return {
    enableThreshold: true,
    threshold: 0,
    contrast: 1.25,
    denoise: false,
    autoThresholdQuantile: 0.55,
  };
}

export async function preprocessBlobForOcr(input: Blob, opts?: OcrPreprocessOpts): Promise<Blob> {
  const img = await loadImage(input);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return input;
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const preprocessed = preprocessForOcr(frame, opts);
  ctx.putImageData(preprocessed, 0, 0);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return out ?? input;
}

export async function rotateBlobForOcr(input: Blob, degrees: 0 | 90): Promise<Blob> {
  if (degrees === 0) return input;
  const img = await loadImage(input);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  if (!ctx) return input;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((Math.PI / 180) * degrees);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return out ?? input;
}

export async function detectLikelyTextInBlob(
  input: Blob,
  opts?: { transitionRatioThreshold?: number; minTransitions?: number; sampleStep?: number }
): Promise<{ looksLikeText: boolean; transitionRatio: number; transitionCount: number }> {
  const transitionRatioThreshold = opts?.transitionRatioThreshold ?? 0.012;
  const minTransitions = opts?.minTransitions ?? 120;
  const sampleStep = Math.max(1, opts?.sampleStep ?? 2);
  const img = await loadImage(input);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { looksLikeText: true, transitionRatio: 0, transitionCount: 0 };
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
  }
  const threshold = 140;
  let transitions = 0;
  let comparisons = 0;
  for (let y = 0; y < height; y += sampleStep) {
    const row = y * width;
    for (let x = 0; x + sampleStep < width; x += sampleStep) {
      const a = gray[row + x] >= threshold ? 1 : 0;
      const b = gray[row + x + sampleStep] >= threshold ? 1 : 0;
      if (a !== b) transitions += 1;
      comparisons += 1;
    }
  }
  const ratio = comparisons > 0 ? transitions / comparisons : 0;
  const looksLikeText = transitions >= minTransitions && ratio >= transitionRatioThreshold;
  return { looksLikeText, transitionRatio: ratio, transitionCount: transitions };
}

export async function ocrImageToText(imageBlob: Blob, locale = 'en-US', timeoutMs = 9000): Promise<string> {
  const worker = await getWorker(locale);
  const task = worker.recognize(imageBlob).then((result) => result?.data?.text || '');
  const timeout = new Promise<string>((resolve) => {
    window.setTimeout(() => resolve(''), timeoutMs);
  });
  return (await Promise.race([task, timeout])).trim();
}

export async function ocrImageToLines(
  imageBlob: Blob,
  locale = 'en-US',
  timeoutMs = 9000
): Promise<Array<{ text: string; confidence: number }>> {
  const worker = await getWorker(locale);
  const task = worker
    .recognize(imageBlob, undefined, { text: true, blocks: true })
    .then((result) => {
      const blocks = result?.data?.blocks ?? [];
      const lines: Array<{ text: string; confidence: number }> = [];
      for (const block of blocks) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const line of paragraph.lines ?? []) {
            const text = String(line.text ?? '').trim();
            if (!text) continue;
            lines.push({
              text,
              confidence: typeof line.confidence === 'number' ? line.confidence / 100 : 0,
            });
          }
        }
      }
      return lines;
    });
  const timeout = new Promise<Array<{ text: string; confidence: number }>>((resolve) => {
    window.setTimeout(() => resolve([]), timeoutMs);
  });
  return await Promise.race([task, timeout]);
}

function normalizeOcrText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a')
    .replace(/[^a-z0-9]/g, '');
}

function transliterateNorwegian(input: string) {
  return input
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a');
}

function scoreOcrLine(line: string, confidence: number) {
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  const density = letters / Math.max(1, line.length);
  const lengthScore = Math.min(1, line.length / 20);
  return (Math.max(0, Math.min(1, confidence)) * 0.55) + (density * 0.25) + (lengthScore * 0.2);
}

function isLikelyNoisySeedLabel(value: string) {
  const normalized = normalizeOcrText(value);
  if (!normalized) return true;
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const shortTokens = tokens.filter((token) => token.length <= 2).length;
  const longTokens = tokens.filter((token) => token.length >= 4).length;
  const letters = (normalized.match(/[a-z]/g) ?? []).length;
  if (letters < 3) return true;
  if (tokens.length >= 2 && shortTokens >= 2 && longTokens === 0) return true;
  if (/^(?:[a-z0-9]\s+){2,}[a-z0-9]$/i.test(normalized)) return true;
  return false;
}

export function getOcrTextStats(rawText: string): OcrTextStats {
  const text = String(rawText ?? '');
  const lettersCount = (text.match(/\p{L}/gu) ?? []).length;
  const digitsCount = (text.match(/\p{N}/gu) ?? []).length;
  return {
    lettersCount,
    digitsCount,
    charCount: lettersCount + digitsCount,
  };
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function brandBoostFromOcrText(
  rawText: string,
  opts?: BrandBoostOptions
): { hits: BrandBoostHit[]; boostedSeeds: string[] } {
  const text = String(rawText ?? '').toLowerCase();
  const compact = normalizeCompact(rawText);
  const weakOcr = (opts?.bestLineScore ?? 1) < 0.62 && (opts?.textCharCount ?? 999) < 20;
  const hasDrinkContext = /\b(ml|l|liter|sukker|kcal|energi|energy|zero|max)\b/i.test(text);
  const hits: BrandBoostHit[] = [];
  const seedSet = new Set<string>();

  for (const rule of BRAND_RULES) {
    const matched: string[] = [];
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) matched.push(pattern.source);
    }
    if (!matched.length) continue;
    const base = matched.length >= 3 ? 0.9 : matched.length === 2 ? 0.75 : 0.55;
    const score = Math.min(0.95, base + (hasDrinkContext ? 0.05 : 0));
    hits.push({ canonical: rule.canonical, score, matched });
    for (const seed of rule.seeds) seedSet.add(seed);
  }

  if (weakOcr) {
    const windows = new Set<string>();
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i + size <= compact.length; i += 1) {
        windows.add(compact.slice(i, i + size));
      }
    }
    const asciiTokens = normalizeOcrText(rawText)
      .split(' ')
      .map((token) => transliterateNorwegian(token))
      .map((token) => token.replace(/[^a-z0-9]/g, '').trim())
      .filter((token) => token.length >= 3 || SHORT_TOKEN_WHITELIST.has(token));

    const hasHit = (canonical: string) => hits.some((hit) => hit.canonical === canonical);
    for (const fragmentRule of FRAGMENT_RULES) {
      if (hasHit(fragmentRule.canonical)) continue;
      const matchedPrefix = fragmentRule.prefixes.find((prefix) => compact.includes(prefix) || windows.has(prefix));
      if (!matchedPrefix) continue;
      if (fragmentRule.canonical === 'pepsi' && matchedPrefix.length < 4 && !/\bpe[p5]/i.test(text)) continue;
      const score = hasDrinkContext ? 0.55 : 0.48;
      hits.push({ canonical: fragmentRule.canonical, score, matched: [`frag:${matchedPrefix}`] });
    }

    if (!hasHit('urge')) {
      const nearUrge = asciiTokens.some((token) => token.length >= 3 && token.length <= 5 && levenshteinDistance(token, 'urge') <= 1);
      if (nearUrge) {
        hits.push({ canonical: 'urge', score: hasDrinkContext ? 0.58 : 0.5, matched: ['edit:urge<=1'] });
      }
    }

    for (const hit of hits) {
      const rule = BRAND_RULES.find((entry) => entry.canonical === hit.canonical);
      if (!rule) continue;
      for (const seed of rule.seeds) seedSet.add(seed);
    }
  }

  for (const hit of hits.sort((a, b) => b.score - a.score)) {
    seedSet.add(hit.canonical);
  }
  const hasZeroHint = /\b(zero|sukkerfri|uten\s*sukker)\b/i.test(text);
  const hasMaxHint = /\bmax\b/i.test(text);
  const orderedSeeds: string[] = [];
  const append = (value: string) => {
    if (!value || orderedSeeds.includes(value)) return;
    orderedSeeds.push(value);
  };
  if (hits.some((hit) => hit.canonical === 'pepsi') && hasMaxHint) {
    append('pepsi max');
  }
  if (hits.some((hit) => hit.canonical === 'pepsi') && hasZeroHint) {
    append('pepsi zero');
    append('pepsi zero sugar');
    append('pepsi uten sukker');
  }
  if (hits.some((hit) => hit.canonical === 'coca cola') && hasZeroHint) {
    append('coca cola zero');
    append('coca cola uten sukker');
  }
  for (const seed of seedSet) append(seed);

  return { hits, boostedSeeds: orderedSeeds };
}

export function ocrTextToSeeds(text: string, maxSeeds = 6): Array<{ label: string; confidence: number }> {
  const cleaned = normalizeOcrText(text);
  if (!cleaned) return [];
  if (isLikelyNoisySeedLabel(cleaned)) return [];

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
  const phrases = [cleaned, ...tokens];
  const deduped = new Map<string, { label: string; confidence: number }>();
  for (const phrase of phrases) {
    if (!phrase) continue;
    if (isLikelyNoisySeedLabel(phrase)) continue;
    const key = phrase.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, { label: phrase, confidence: phrase === cleaned ? 0.52 : 0.38 });
    }
  }
  return [...deduped.values()].slice(0, maxSeeds);
}

export function ocrLinesToSeeds(
  lines: Array<{ text: string; confidence: number }>,
  maxSeeds = 6
): Array<{ label: string; confidence: number }> {
  const scored = lines
    .map((line) => {
      const normalized = normalizeOcrText(line.text);
      const normalizedAscii = transliterateNorwegian(normalized);
      if (!normalized || normalized.length < 4) return null;
      if (isLikelyNoisySeedLabel(normalized)) return null;
      if (NOISE_WORDS.has(normalized) || NOISE_WORDS.has(normalizedAscii)) return null;
      const score = scoreOcrLine(normalized, line.confidence);
      if (score < 0.25) return null;
      return { label: normalized, confidence: score };
    })
    .filter((entry): entry is { label: string; confidence: number } => entry !== null)
    .sort((a, b) => b.confidence - a.confidence);

  const deduped = new Map<string, { label: string; confidence: number }>();
  for (const row of scored) {
    const key = row.label.trim().toLowerCase();
    if (!key) continue;
    const prev = deduped.get(key);
    if (!prev || row.confidence > prev.confidence) {
      deduped.set(key, row);
    }
  }
  return [...deduped.values()].slice(0, maxSeeds);
}
