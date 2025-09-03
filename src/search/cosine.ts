import { Document, SearchAlgorithm } from '../types/interfaces.js';

export const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
  
    return dot / (magnitudeA * magnitudeB);
};

export class CosineSearchAlgorithm implements SearchAlgorithm {
  async search(queryVector: number[], documents: Document[], topK: number): Promise<(Document & { score: number })[]> {
    const scored = documents.map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryVector, doc.vector)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
  