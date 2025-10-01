'use strict';

class GemmaEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName || 'onnx-community/embeddinggemma-300m-ONNX';
    this.dimension = options.dimension || 768;
    this.embedder = null;
    this.prefixes = {
      query: 'task: search result | query: ',
      document: 'title: none | text: '
    };
  }

  async loadModel() {
    if (this.embedder) return;

    const { pipeline } = require('@xenova/transformers');

    console.log(`Loading EmbeddingGemma model: ${this.modelName}`);
    this.embedder = await pipeline('feature-extraction', this.modelName, {
      quantized: true
    });
    console.log('Model loaded successfully:', this.modelName);
  }

  async embed(text) {
    await this.loadModel();

    const prefixedText = this.prefixes.document + String(text);
    const output = await this.embedder(prefixedText, {
      pooling: 'mean',
      normalize: true
    });

    const embedding = Array.from(output.data);

    if (this.dimension < 768) {
      return embedding.slice(0, this.dimension);
    }

    return embedding;
  }

  getDimension() {
    return this.dimension;
  }
}

module.exports = { GemmaEmbedder };
