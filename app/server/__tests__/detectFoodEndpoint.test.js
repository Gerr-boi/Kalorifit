import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../createApp.js';

describe('POST /api/detect-food', () => {
  it('returns normalized food items from provider', async () => {
    const provider = {
      detectFood: async () => [
        { name: 'Pizza', confidence: 0.93 },
        { name: 'chips', confidence: 0.9 },
        { name: 'shoe', confidence: 0.99 },
      ],
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app)
      .post('/api/detect-food')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      { name: 'pizza', confidence: 0.93 },
      { name: 'fries', confidence: 0.9 },
    ]);
  });

  it('passes through scan log id and text detections from provider payload', async () => {
    const provider = {
      detectFood: async () => ({
        ok: true,
        model: 'dummy-v1',
        latency_ms: 12,
        scan_log_id: 'scan-log-123',
        items: [{ name: 'banana', confidence: 0.88 }],
        detections: [{ label: 'banana', confidence: 0.88, bbox: [1, 2, 3, 4] }],
        text_detections: [{ text: 'BANANA', confidence: 0.77 }],
      }),
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app)
      .post('/api/detect-food')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body.scan_log_id).toBe('scan-log-123');
    expect(response.body.meta.scanLogId).toBe('scan-log-123');
    expect(response.body.text_detections).toEqual([{ text: 'BANANA', confidence: 0.77 }]);
  });
});

describe('POST /api/scan-feedback', () => {
  it('forwards correction payload to provider', async () => {
    const provider = {
      detectFood: async () => ({ items: [] }),
      submitFeedback: async (payload) => ({
        ok: true,
        scan_log_id: payload.scan_log_id,
      }),
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app).post('/api/scan-feedback').send({
      scanLogId: 'scan-log-555',
      userConfirmed: false,
      userCorrectedTo: 'apple',
      notFood: false,
      badPhoto: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.scan_log_id).toBe('scan-log-555');
  });
});

describe('POST /api/predict-dish', () => {
  it('returns normalized dish predictions from provider', async () => {
    const provider = {
      detectFood: async () => ({ items: [] }),
      predictDish: async () => ({
        model: 'food101-efficientnet-b0',
        results: [
          { label: 'ramen', confidence: 0.81 },
          { label: 'caesar salad', prob: 0.66 },
        ],
      }),
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app)
      .post('/api/predict-dish')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.results).toEqual([
      { label: 'ramen', confidence: 0.81 },
      { label: 'caesar salad', confidence: 0.66 },
    ]);
  });

  it('rate-limits by device id first and falls back to IP when missing', async () => {
    const provider = {
      detectFood: async () => ({ items: [] }),
      predictDish: async () => ({ model: 'm', results: [{ label: 'ramen', confidence: 0.7 }] }),
    };
    const app = createApp({ provider, threshold: 0.75 });
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    for (let i = 0; i < 40; i += 1) {
      const ok = await request(app)
        .post('/api/predict-dish')
        .set('X-Scan-Device-Id', 'device-a')
        .attach('image', image, { filename: `d-a-${i}.jpg`, contentType: 'image/jpeg' });
      expect(ok.status).toBe(200);
    }

    const limitedA = await request(app)
      .post('/api/predict-dish')
      .set('X-Scan-Device-Id', 'device-a')
      .attach('image', image, { filename: 'd-a-limit.jpg', contentType: 'image/jpeg' });
    expect(limitedA.status).toBe(429);

    const okDeviceB = await request(app)
      .post('/api/predict-dish')
      .set('X-Scan-Device-Id', 'device-b')
      .attach('image', image, { filename: 'd-b.jpg', contentType: 'image/jpeg' });
    expect(okDeviceB.status).toBe(200);

    const appNoDevice = createApp({ provider, threshold: 0.75 });
    for (let i = 0; i < 40; i += 1) {
      const ok = await request(appNoDevice)
        .post('/api/predict-dish')
        .attach('image', image, { filename: `ip-${i}.jpg`, contentType: 'image/jpeg' });
      expect(ok.status).toBe(200);
    }
    const limitedByIp = await request(appNoDevice)
      .post('/api/predict-dish')
      .attach('image', image, { filename: 'ip-limit.jpg', contentType: 'image/jpeg' });
    expect(limitedByIp.status).toBe(429);
  });

  it('opens circuit after repeated failures and returns circuitOpen metadata', async () => {
    let calls = 0;
    const provider = {
      detectFood: async () => ({ items: [] }),
      predictDish: async () => {
        calls += 1;
        throw new Error('upstream broken');
      },
    };
    const app = createApp({ provider, threshold: 0.75 });
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    for (let i = 0; i < 3; i += 1) {
      const fail = await request(app)
        .post('/api/predict-dish')
        .attach('image', image, { filename: `err-${i}.jpg`, contentType: 'image/jpeg' });
      expect(fail.status).toBe(502);
    }

    const circuit = await request(app)
      .post('/api/predict-dish')
      .attach('image', image, { filename: 'circuit-open.jpg', contentType: 'image/jpeg' });
    expect(circuit.status).toBe(200);
    expect(circuit.body.meta?.circuitOpen).toBe(true);
    expect(calls).toBe(3);
  });
});
