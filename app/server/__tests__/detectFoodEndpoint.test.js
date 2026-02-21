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
