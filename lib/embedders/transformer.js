'use strict';

const { pipeline, env } = require('@xenova/transformers');

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = false;
env.cacheDir = './.cache';

class TransformerEmbedder {
  constructor(model, modelName) {
    this.model = model;
    this.modelName = modelName;
  }

  static async create(modelName = 'Xenova/bge-small-en-v1.5') {
    try {
      const model = await pipeline('feature-extraction', modelName, {
        quantized: false,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`Downloading: ${progress.name} - ${progress.progress?.toFixed(1)}%`);
          } else if (progress.status === 'loading') {
            console.log(`Loading: ${progress.name}`);
          }
        }
      });

      console.log(`Model loaded successfully: ${modelName}`);
      return new TransformerEmbedder(model, modelName);
    } catch (error) {
      console.error(`Failed to load transformer model ${modelName}:`, error);

      if (error.message && error.message.includes('JSON.parse')) {
        throw new Error(`Network error: Unable to download model files for ${modelName}. Check your internet connection.`);
      } else if (error.message && error.message.includes('fetch')) {
        throw new Error(`Network error: Model download failed for ${modelName}. The model server might be unavailable.`);
      } else {
        throw new Error(`TransformerEmbedder initialization failed for ${modelName}: ${error.message || 'Unknown error'}`);
      }
    }
  }

  async embed(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text input cannot be empty');
      }

      const output = await this.model(text, { pooling: 'mean', normalize: true });
      const result = Array.from(output.data);

      if (!result || result.length === 0) {
        throw new Error('Model returned empty embedding');
      }

      return result;
    } catch (error) {
      console.error('Error during text embedding:', error);
      throw new Error(`Failed to embed text: ${error.message || 'Unknown error'}`);
    }
  }
}

module.exports = { TransformerEmbedder };