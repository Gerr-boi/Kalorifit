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
        packaging_type: 'can',
        top_match: {
          name: 'banana can',
          brand: 'kalorifit',
          product_name: 'banana energy',
          confidence: 0.91,
        },
        alternatives: [
          {
            name: 'banana zero',
            brand: 'kalorifit',
            product_name: 'banana zero',
            confidence: 0.72,
          },
        ],
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
    expect(response.body.packaging_type).toBe('can');
    expect(response.body.top_match).toEqual({
      name: 'banana can',
      brand: 'kalorifit',
      product_name: 'banana energy',
      confidence: 0.91,
    });
    expect(response.body.alternatives).toEqual([
      {
        name: 'banana zero',
        brand: 'kalorifit',
        product_name: 'banana zero',
        confidence: 0.72,
      },
    ]);
  });

  it('returns a specific configuration error when the food bot is misconfigured', async () => {
    const provider = {
      detectFood: async () => {
        throw new Error(
          'FOOD_DETECTION_BOT_CONFIGURATION_ERROR: FOOD_DETECTION_BOT_URL points to http://127.0.0.1:8001, which is only reachable locally.'
        );
      },
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app)
      .post('/api/detect-food')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('FOOD_DETECTION_BOT_CONFIGURATION_ERROR');
    expect(response.body.message).toContain('only reachable locally');
  });
});

describe('GET /api/scan-ranking-rules', () => {
  it('returns adaptive ranking metadata for scanner learning', async () => {
    const app = createApp({ provider: {} });
    const response = await request(app).get('/api/scan-ranking-rules');

    expect(response.status).toBe(200);
    expect(response.body.meta.rulesEnabled).toBe(true);
    expect(typeof response.body.rules.maxPenaltyPerBrand).toBe('number');
    expect(Array.isArray(response.body.rules.doNotPrefer)).toBe(true);
    expect(Array.isArray(response.body.rules.boosts)).toBe(true);
  });
});

describe('POST /api/predict-dish', () => {
  it('forwards dish prediction requests to the provider', async () => {
    const provider = {
      predictDish: async (_imageBytes, options) => ({
        ok: true,
        model: 'dish-v1',
        results: [
          { label: 'omelette', confidence: 0.82, source: 'dish_classifier' },
          { label: 'scrambled eggs', confidence: 0.44, source: 'dish_classifier' },
        ],
        meta: {
          circuitOpen: options.topk === 5 ? false : true,
        },
      }),
    };

    const app = createApp({ provider });
    const response = await request(app)
      .post('/api/predict-dish')
      .field('topk', '5')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe('dish-v1');
    expect(response.body.results).toEqual([
      { label: 'omelette', confidence: 0.82, source: 'dish_classifier' },
      { label: 'scrambled eggs', confidence: 0.44, source: 'dish_classifier' },
    ]);
    expect(response.body.meta.circuitOpen).toBe(false);
  });
});

describe('scanner learning loop', () => {
  it('surfaces updated ranking rules after correction feedback', async () => {
    let learnedItemId = null;
    const provider = {
      detectFood: async () => ({
        ok: true,
        model: 'dummy-v1',
        latency_ms: 9,
        scan_log_id: 'scan-log-learn-1',
        items: [{ name: 'apple drink', confidence: 0.61 }],
        top_match: {
          name: 'apple drink',
          product_id: 'item-apple-drink',
          confidence: 0.61,
        },
        alternatives: [
          {
            name: 'orange drink',
            product_id: 'item-orange-drink',
            confidence: 0.58,
          },
        ],
      }),
      submitFeedback: async (payload) => {
        learnedItemId = payload.feedback_context?.userFinalItemId ?? null;
        return {
          ok: true,
          scan_log_id: payload.scan_log_id,
        };
      },
    };
    const loadAdaptiveRankingRules = async () => ({
      rules: {
        maxPenaltyPerBrand: 0.35,
        maxBoostPerBrand: 0.25,
        doNotPrefer: [],
        boosts: learnedItemId
          ? [{ canonical: 'apple drink', itemId: learnedItemId, boost: 0.2 }]
          : [],
      },
      meta: {
        rulesEnabled: true,
        killSwitch: false,
        generatedAt: '2026-02-28T00:00:00.000Z',
      },
    });

    const app = createApp({ provider, loadAdaptiveRankingRules });

    const detectResponse = await request(app)
      .post('/api/detect-food')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });
    expect(detectResponse.status).toBe(200);
    expect(detectResponse.body.scan_log_id).toBe('scan-log-learn-1');

    const feedbackResponse = await request(app).post('/api/scan-feedback').send({
      scanLogId: 'scan-log-learn-1',
      userConfirmed: false,
      userCorrectedTo: 'apple drink',
      feedbackContext: {
        userFinalItemId: 'item-apple-drink',
        resolverChosenItemId: 'item-orange-drink',
        hadCorrectionTap: true,
      },
    });
    expect(feedbackResponse.status).toBe(200);

    const rulesResponse = await request(app).get('/api/scan-ranking-rules');
    expect(rulesResponse.status).toBe(200);
    expect(rulesResponse.body.rules.boosts).toEqual([
      { canonical: 'apple drink', itemId: 'item-apple-drink', boost: 0.2 },
    ]);
  });
});

describe('POST /api/scan-feedback', () => {
  it('forwards correction payload to provider', async () => {
    let receivedPayload = null;
    const provider = {
      detectFood: async () => ({ items: [] }),
      submitFeedback: async (payload) => {
        receivedPayload = payload;
        return {
        ok: true,
        scan_log_id: payload.scan_log_id,
        };
      },
    };

    const app = createApp({ provider, threshold: 0.75 });
    const response = await request(app).post('/api/scan-feedback').send({
      scanLogId: 'scan-log-555',
      userConfirmed: false,
      userCorrectedTo: 'apple',
      notFood: false,
      badPhoto: true,
      correctedDetection: {
        label: 'apple',
        bbox: [10, 20, 30, 40],
      },
      feedbackContext: {
        frontVisibilityScore: 0.32,
        selectedFrameGlare: 0.84,
        packagingType: 'can',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.scan_log_id).toBe('scan-log-555');
    expect(receivedPayload.corrected_detection).toEqual({
      label: 'apple',
      bbox: [10, 20, 30, 40],
    });
    expect(receivedPayload.feedback_context).toEqual({
      frontVisibilityScore: 0.32,
      selectedFrameGlare: 0.84,
      packagingType: 'can',
    });
  });
});
