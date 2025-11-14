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
    let embedderType = config.embedderProvider || config.embedderType || 'auto';

    if (embedderType === 'auto') {
      // Auto-detect available embedder: try vLLM, then Ollama, then transformers.js
      const vllmEmbedder = new VLLMEmbedder({
        modelName: config.modelName,
        host: config.vllmHost || config.host || 'http://localhost:8000'
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
                `Start vLLM: python -m vllm.entrypoints.openai.api_server --model ${config.modelName} --port 8000\n` +
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
    } else if (embedderType === 'vllm') {
      // Explicit vLLM provider
      embedder = new VLLMEmbedder({
        modelName: config.modelName,
        host: config.host || config.vllmHost || 'http://localhost:8000'
      });

      const connected = await embedder.checkConnection();
      if (!connected) {
        throw new Error(
          `Cannot connect to vLLM server at ${config.host || config.vllmHost}.\n` +
          `Please start vLLM with: python -m vllm.entrypoints.openai.api_server --model ${config.modelName} --port 8000\n` +
          `Or use Ollama by setting embedderProvider: 'ollama'`
        );
      }
    } else if (embedderType === 'ollama') {
      // Explicit Ollama provider
      embedder = new OllamaEmbedder({
        modelName: config.modelName,
        host: config.ollamaHost
      });

      const connected = await embedder.checkConnection();
      if (!connected) {
        if (config.autoSetupOllama === false) {
          throw new Error(
            `Cannot connect to Ollama server at ${config.ollamaHost}.\n` +
            `Please start Ollama with: ollama serve\n` +
            `Then pull the model: ollama pull ${config.modelName}`
          );
        }

        console.error('⚙️  Ollama not running, setting up local instance...');
        const setup = new OllamaSetup();
        await setup.ensureOllamaReady(config.modelName);
      }
    } else if (embedderType === 'transformers') {
      // Explicit transformers.js provider
      embedder = new TransformersEmbedder({
        modelName: config.transformersModel || 'Xenova/bge-base-en-v1.5',
        dimension: config.dimension
      });
      const transformersAvailable = await embedder.checkConnection();
      if (!transformersAvailable) {
        throw new Error('transformers.js not available. Run: npm install @huggingface/transformers');
      }
    } else {
      throw new Error(`Unknown embedder provider: ${embedderType}. Use 'vllm', 'ollama', 'transformers', or 'auto'.`);
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
