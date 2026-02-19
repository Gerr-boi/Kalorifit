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
});
