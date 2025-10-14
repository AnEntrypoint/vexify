'use strict';

const cosineSimilarity = (a, b) => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dot / (magnitudeA * magnitudeB);
};

class CosineSearchAlgorithm {
  async search(queryVector, documents, topK) {
    const scored = documents.map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryVector, doc.vector)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

module.exports = { CosineSearchAlgorithm, cosineSimilarity };