import { afterEach, describe, expect, it } from 'vitest';
import { FoodDetectionBotProvider } from '../providers/foodDetectionBotProvider.js';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_URL: process.env.VERCEL_URL,
  FOOD_DETECTION_BOT_URL: process.env.FOOD_DETECTION_BOT_URL,
};

afterEach(() => {
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  }

  if (ORIGINAL_ENV.VERCEL === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = ORIGINAL_ENV.VERCEL;
  }

  if (ORIGINAL_ENV.VERCEL_URL === undefined) {
    delete process.env.VERCEL_URL;
  } else {
    process.env.VERCEL_URL = ORIGINAL_ENV.VERCEL_URL;
  }

  if (ORIGINAL_ENV.FOOD_DETECTION_BOT_URL === undefined) {
    delete process.env.FOOD_DETECTION_BOT_URL;
  } else {
    process.env.FOOD_DETECTION_BOT_URL = ORIGINAL_ENV.FOOD_DETECTION_BOT_URL;
  }
});

describe('FoodDetectionBotProvider', () => {
  it('rejects loopback URLs in Vercel runtime', async () => {
    process.env.VERCEL = '1';
    delete process.env.VERCEL_URL;

    const provider = new FoodDetectionBotProvider({ baseUrl: 'http://127.0.0.1:8001' });

    await expect(provider.detectFood(Buffer.from([0xff]))).rejects.toThrow(
      /FOOD_DETECTION_BOT_CONFIGURATION_ERROR/
    );
  });

  it('reports invalid configuration in health checks', async () => {
    process.env.VERCEL = '1';
    delete process.env.VERCEL_URL;

    const provider = new FoodDetectionBotProvider({ baseUrl: 'http://localhost:8001' });
    const health = await provider.health();

    expect(health.ok).toBe(false);
    expect(health.error).toBe('FOOD_DETECTION_BOT_CONFIGURATION_ERROR');
    expect(health.message).toContain('cannot point to localhost');
  });

  it('derives a local scanner URL from the incoming request host in development', async () => {
    delete process.env.FOOD_DETECTION_BOT_URL;
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    process.env.NODE_ENV = 'development';

    const provider = new FoodDetectionBotProvider();
    const config = provider.getRuntimeConfig({
      headers: { host: '192.168.1.25:5173' },
      protocol: 'http',
      get(name) {
        return this.headers[name];
      },
    });

    expect(config.isValid).toBe(true);
    expect(config.baseUrl).toBe('http://192.168.1.25:8001');
    expect(config.source).toBe('request-host');
  });
});
