import { afterEach, describe, expect, it } from 'vitest';
import { FoodDetectionBotProvider } from '../providers/foodDetectionBotProvider.js';

const ORIGINAL_ENV = {
  VERCEL: process.env.VERCEL,
  VERCEL_URL: process.env.VERCEL_URL,
};

afterEach(() => {
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
    expect(health.message).toContain('public food bot domain');
  });
});
