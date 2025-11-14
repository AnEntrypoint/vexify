'use strict';

let pipelineInstance = null;
let transformers = null;

class TransformersEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName || 'Xenova/bge-base-en-v1.5';
    this.dimension = options.dimension;
    this.initialized = false;
  }

  async _ensureInitialized() {
    if (pipelineInstance) {
      this.initialized = true;
      return pipelineInstance;
    }

    if (!transformers) {
      try {
        transformers = require('@huggingface/transformers');
      } catch (error) {
        throw new Error(
          'transformers.js not installed. Run: npm install @huggingface/transformers'
        );
      }
    }

    try {
      pipelineInstance = await transformers.pipeline(
        'feature-extraction',
        this.modelName,
        { quantized: false }
      );
      this.initialized = true;
      return pipelineInstance;
    } catch (error) {
      throw new Error(
        `Failed to load model ${this.modelName}: ${error.message}`
      );
    }
  }

  async embed(text, retries = 3) {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const extractor = await this._ensureInitialized();
        const result = await extractor(text, {
          pooling: 'mean',
          normalize: true
        });

        const embedding = Array.from(result.data);

        if (this.dimension && embedding.length > this.dimension) {
          return embedding.slice(0, this.dimension);
        }

        return embedding;
      } catch (error) {
        if (attempt === retries - 1) {
          throw new Error(`Embedding failed: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  async checkConnection() {
    try {
      if (!transformers) {
        transformers = require('@huggingface/transformers');
      }
      return true;
    } catch {
      return false;
    }
  }

  getDimension() {
    const dimensions = {
      'Xenova/all-MiniLM-L6-v2': 384,
      'Xenova/bge-small-en-v1.5': 384,
      'Xenova/bge-base-en-v1.5': 768,
      'Xenova/bge-large-en-v1.5': 1024,
      'Xenova/multilingual-e5-small': 384,
      'Xenova/multilingual-e5-base': 768,
      'Xenova/multilingual-e5-large': 1024
    };
    return this.dimension || dimensions[this.modelName] || 768;
  }
}

module.exports = { TransformersEmbedder };
