'use strict';

const { VecStore } = require('./vecstore');
const { OllamaEmbedder } = require('./embedders/ollama');
const { VLLMEmbedder } = require('./embedders/vllm');
const { TransformersEmbedder } = require('./embedders/transformers');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { SqliteVecSearch } = require('./search/sqlite-vec');
const { getConfig, detectOptimalModel, getModelDimension, validateModelDimension } = require('./config/defaults');
const { OllamaSetup } = require('./utils/ollama-setup');

class VecStoreFactory {
  static async create(options = {}) {
    const config = getConfig(options);

    if (!options.modelName) {
      const detectedModel = detectOptimalModel(options.directory || process.cwd());
      config.modelName = detectedModel;
    }

    let embedder;
    let embedderType = options.embedderType || 'auto';

    if (embedderType === 'auto') {
      const vllmEmbedder = new VLLMEmbedder({
        modelName: config.modelName,
        host: config.vllmHost || 'http://localhost:8000'
      });

      const vllmAvailable = await vllmEmbedder.checkConnection();

      if (vllmAvailable) {
        embedder = vllmEmbedder;
        embedderType = 'vllm';
      } else {
        const ollamaEmbedder = new OllamaEmbedder({
          modelName: config.modelName,
          host: config.ollamaHost
        });

        const ollamaAvailable = await ollamaEmbedder.checkConnection();

        if (ollamaAvailable) {
          embedder = ollamaEmbedder;
          embedderType = 'ollama';
        } else {
          const transformersEmbedder = new TransformersEmbedder({
            modelName: config.transformersModel || 'Xenova/bge-base-en-v1.5',
            dimension: config.dimension
          });

          const transformersAvailable = await transformersEmbedder.checkConnection();

          if (transformersAvailable) {
            embedder = transformersEmbedder;
            embedderType = 'transformers';
          } else {
            if (config.autoSetupOllama === false) {
              throw new Error(
                `No embedding service available.\n` +
                `Start vLLM: vllm serve <model> --port 8000\n` +
                `OR start Ollama: ollama serve && ollama pull ${config.modelName}\n` +
                `OR install transformers.js: npm install @huggingface/transformers`
              );
            }

            console.error('⚙️  No vLLM, Ollama, or transformers.js found, setting up local Ollama...');
            const setup = new OllamaSetup();
            await setup.ensureOllamaReady(config.modelName);
            embedder = ollamaEmbedder;
            embedderType = 'ollama';
          }
        }
      }
    } else if (embedderType === 'transformers') {
      embedder = new TransformersEmbedder({
        modelName: config.transformersModel || 'Xenova/bge-base-en-v1.5',
        dimension: config.dimension
      });
      const transformersAvailable = await embedder.checkConnection();
      if (!transformersAvailable) {
        throw new Error('transformers.js not available. Run: npm install @huggingface/transformers');
      }
    } else if (embedderType === 'vllm') {
      embedder = new VLLMEmbedder({
        modelName: config.modelName,
        host: config.vllmHost || 'http://localhost:8000'
      });
      const vllmAvailable = await embedder.checkConnection();
      if (!vllmAvailable) {
        throw new Error(`vLLM not available at ${config.vllmHost || 'http://localhost:8000'}`);
      }
    } else if (embedderType === 'ollama') {
      embedder = new OllamaEmbedder({
        modelName: config.modelName,
        host: config.ollamaHost
      });
      const ollamaAvailable = await embedder.checkConnection();
      if (!ollamaAvailable && config.autoSetupOllama === false) {
        throw new Error(`Ollama not available at ${config.ollamaHost}`);
      } else if (!ollamaAvailable) {
        console.error('⚙️  Ollama not running, setting up local instance...');
        const setup = new OllamaSetup();
        await setup.ensureOllamaReady(config.modelName);
      }
    }

    const store = new SQLiteStorageAdapter(config.dbPath);
    const modelDimension = getModelDimension(config.modelName);
    const search = new SqliteVecSearch(store.db, 'vec_index', modelDimension);

    const vecStore = new VecStore({
      embedder,
      store,
      search,
      storeContent: config.storeContent,
      embedBatchSize: config.embedBatchSize,
      embedConcurrency: config.embedConcurrency,
      bufferSize: config.bufferSize || 100,
      flushDelay: config.flushDelay || 1000,
      modelName: config.modelName,
      validateDimension: validateModelDimension
    });

    await vecStore.initialize();

    return vecStore;
  }
}

module.exports = { VecStoreFactory };
