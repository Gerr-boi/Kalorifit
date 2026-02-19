/**
 * Provider adapter interface:
 * detectFood(imageBytes: Buffer): Promise<Array<{name: string, confidence: number}>>
 */
export class FoodDetectorProvider {
  async detectFood(_imageBytes, _options = {}) {
    throw new Error('FoodDetectorProvider.detectFood must be implemented');
  }
}
