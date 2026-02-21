/**
 * Provider adapter interface:
 * detectFood(imageBytes: Buffer, options?: object): Promise<{
 *   ok?: boolean;
 *   model?: string;
 *   latency_ms?: number;
 *   items?: Array<{name: string, confidence: number, count?: number}>;
 *   detections?: Array<{label: string, confidence: number, bbox?: number[]}>;
 * } | Array<{name: string, confidence: number}>>
 */
export class FoodDetectorProvider {
  async detectFood(_imageBytes, _options = {}) {
    throw new Error('FoodDetectorProvider.detectFood must be implemented');
  }

  async submitFeedback(_payload, _options = {}) {
    throw new Error('FoodDetectorProvider.submitFeedback must be implemented');
  }
  async health() {
    return null;
  }
}
