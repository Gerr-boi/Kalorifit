const DEFAULT_LOCAL_BOT_URL = 'http://127.0.0.1:8001';

function isLocalScannerUrl(value) {
  return /^https?:\/\/(?:127(?:\.\d{1,3}){3}|localhost)(?::\d+)?(?:\/|$)/i.test(value);
}

export function getScannerRuntimeConfig() {
  const configuredUrl = (process.env.FOOD_DETECTION_BOT_URL ?? '').trim();
  const baseUrl = configuredUrl || DEFAULT_LOCAL_BOT_URL;
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  const isProduction = process.env.NODE_ENV === 'production' || isVercel;
  const issues = [];

  let parsedUrl = null;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    issues.push('FOOD_DETECTION_BOT_URL is not a valid URL.');
  }

  const localhostUrl = isLocalScannerUrl(baseUrl);

  if (isProduction && !configuredUrl) {
    issues.push('FOOD_DETECTION_BOT_URL must be set in production.');
  }
  if (isProduction && localhostUrl) {
    issues.push('FOOD_DETECTION_BOT_URL cannot point to localhost or 127.0.0.1 in production.');
  }
  if (isProduction && parsedUrl && parsedUrl.protocol !== 'https:') {
    issues.push('FOOD_DETECTION_BOT_URL should use HTTPS in production.');
  }

  return {
    baseUrl,
    source: configuredUrl ? 'env' : 'default',
    isProduction,
    isVercel,
    localhostUrl,
    isValid: issues.length === 0,
    issues,
  };
}

export function createScannerRuntimeError() {
  const config = getScannerRuntimeConfig();
  const message =
    config.issues[0] ??
    'Scanner runtime is misconfigured. Set FOOD_DETECTION_BOT_URL to a publicly reachable scanner service.';
  const error = new Error(message);
  error.code = 'SCANNER_RUNTIME_MISCONFIGURED';
  error.details = config;
  return error;
}
