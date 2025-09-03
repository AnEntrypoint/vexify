import { pipeline, env } from '@xenova/transformers';
import { Embedder } from '../types/interfaces.js';

// Configure transformers environment
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;

export class TransformerEmbedder implements Embedder {
  private model: any;
  private modelName: string;

  private constructor(model: any, modelName: string) {
    this.model = model;
    this.modelName = modelName;
  }

  static async create(modelName: string = 'Xenova/bge-small-en-v1.5'): Promise<TransformerEmbedder> {
    try {
      

      const model = await pipeline('feature-extraction', modelName, {
        quantized: false,
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading') {
            console.log(`Downloading: ${progress.name} - ${progress.progress?.toFixed(1)}%`);
          } else if (progress.status === 'loading') {
            console.log(`Loading: ${progress.name}`);
          }
        }
      });

      console.log(`Model loaded successfully: ${modelName}`);
      return new TransformerEmbedder(model, modelName);
    } catch (error: any) {
      console.error(`Failed to load transformer model ${modelName}:`, error);

      // Provide more specific error messages
      if (error.message && error.message.includes('JSON.parse')) {
        throw new Error(`Network error: Unable to download model files for ${modelName}. Check your internet connection.`);
      } else if (error.message && error.message.includes('fetch')) {
        throw new Error(`Network error: Model download failed for ${modelName}. The model server might be unavailable.`);
      } else {
        throw new Error(`TransformerEmbedder initialization failed for ${modelName}: ${error.message || 'Unknown error'}`);
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text input cannot be empty');
      }

      const output = await this.model(text, { pooling: 'mean', normalize: true });
      const result = Array.from(output.data) as number[];

      if (!result || result.length === 0) {
        throw new Error('Model returned empty embedding');
      }

      return result;
    } catch (error: any) {
      console.error('Error during text embedding:', error);
      throw new Error(`Failed to embed text: ${error.message || 'Unknown error'}`);
    }
  }
}
