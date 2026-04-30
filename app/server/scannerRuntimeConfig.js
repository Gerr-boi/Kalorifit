const DEFAULT_LOCAL_SCANNER_PORT = 8001;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function parseBoolean(value) {
  return value === '1' || value === 'true';
}

function normalizeConfiguredUrl(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRequestHostname(request) {
  const forwardedHost = request?.get?.('x-forwarded-host') ?? request?.headers?.['x-forwarded-host'];
  const hostHeader = typeof forwardedHost === 'string' && forwardedHost.trim()
    ? forwardedHost
    : (request?.get?.('host') ?? request?.headers?.host ?? request?.hostname ?? '');

  if (typeof hostHeader !== 'string' || !hostHeader.trim()) {
    return null;
  }

  try {
    return new URL(`http://${hostHeader.trim()}`).hostname;
  } catch {
    return null;
  }
}

function deriveLocalBaseUrl(request, port) {
  const hostname = getRequestHostname(request);
  if (!hostname) return null;
  return `http://${hostname}:${port}`;
}

function isLocalScannerUrl(value) {
  try {
    const parsed = new URL(value);
    return LOCAL_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

function pushCandidate(list, value) {
  if (typeof value !== 'string') return;
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) return;
  if (list.includes(normalized)) return;
  list.push(normalized);
}

export function getScannerRuntimeConfig(options = {}) {
  const configuredUrl = normalizeConfiguredUrl(options.configuredUrl ?? process.env.FOOD_DETECTION_BOT_URL);
  const portRaw = options.port ?? process.env.FOOD_DETECTION_BOT_PORT ?? DEFAULT_LOCAL_SCANNER_PORT;
  const port = Number.parseInt(String(portRaw), 10);
  const scannerPort = Number.isFinite(port) && port > 0 ? port : DEFAULT_LOCAL_SCANNER_PORT;
  const isVercel = parseBoolean(String(options.vercel ?? process.env.VERCEL ?? ''));
  const nodeEnv = String(options.nodeEnv ?? process.env.NODE_ENV ?? '');
  const isProduction = nodeEnv === 'production' || isVercel;
  const request = options.request ?? null;

  let baseUrl = configuredUrl || null;
  let source = configuredUrl ? 'env' : 'unset';
  const candidates = [];
  const derivedUrl = !isProduction ? deriveLocalBaseUrl(request, scannerPort) : null;
  const localhostUrl = `http://localhost:${scannerPort}`;
  const loopbackUrl = `http://127.0.0.1:${scannerPort}`;

  if (isProduction) {
    pushCandidate(candidates, configuredUrl);
  } else {
    // Non-local configured URL always goes first
    if (configuredUrl && !isLocalScannerUrl(configuredUrl)) {
      pushCandidate(candidates, configuredUrl);
    }
    // Local configured URL and localhost come before derivedUrl.
    // derivedUrl is derived from the request's Host header (e.g. http://192.168.x.x:8001)
    // which is correct for the *client* machine but wrong for the *bot* — the bot always
    // listens on localhost of the server machine. Putting it after localhost ensures that
    // requests from phones on the LAN still reach the bot (localhost succeeds first).
    if (configuredUrl && isLocalScannerUrl(configuredUrl)) {
      pushCandidate(candidates, configuredUrl);
    }
    pushCandidate(candidates, localhostUrl);
    pushCandidate(candidates, loopbackUrl);
    pushCandidate(candidates, derivedUrl);
  }

  if (!isProduction && candidates.length > 0) {
    baseUrl = candidates[0];
    if (derivedUrl && baseUrl === derivedUrl) {
      source = 'request-host';
    } else if (configuredUrl && baseUrl === configuredUrl) {
      source = 'env';
    } else if (baseUrl === localhostUrl || baseUrl === loopbackUrl) {
      source = 'default-local';
    }
  }

  if (!baseUrl && !isProduction) {
    if (derivedUrl) {
      baseUrl = derivedUrl;
      source = 'request-host';
    }
  }

  if (!baseUrl && !isProduction) {
    baseUrl = `http://localhost:${scannerPort}`;
    source = 'default-local';
  }

  const issues = [];
  let parsedUrl = null;

  if (baseUrl) {
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      issues.push('FOOD_DETECTION_BOT_URL is not a valid URL.');
    }
  }

  const localBaseUrl = baseUrl ? isLocalScannerUrl(baseUrl) : false;

  if (isProduction && !configuredUrl) {
    issues.push('FOOD_DETECTION_BOT_URL must be set in production.');
  }
  if (isProduction && localBaseUrl) {
    issues.push('FOOD_DETECTION_BOT_URL cannot point to localhost or 127.0.0.1 in production.');
  }
  if (isProduction && parsedUrl && parsedUrl.protocol !== 'https:') {
    issues.push('FOOD_DETECTION_BOT_URL should use HTTPS in production.');
  }

  return {
    baseUrl,
    candidates,
    source,
    isProduction,
    isVercel,
    localhostUrl: localBaseUrl,
    isValid: issues.length === 0,
    issues,
  };
}

export function createScannerRuntimeError(options = {}) {
  const config = getScannerRuntimeConfig(options);
  const message =
    config.issues[0] ??
    'Scanner runtime is misconfigured. Set FOOD_DETECTION_BOT_URL to a publicly reachable scanner service.';
  const error = new Error(message);
  error.code = 'SCANNER_RUNTIME_MISCONFIGURED';
  error.details = config;
  return error;
}
