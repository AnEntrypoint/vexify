'use strict';

const { VecStore } = require('./vecstore');
const { OllamaEmbedder } = require('./embedders/ollama');
const { VLLMEmbedder } = require('./embedders/vllm');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { SqliteVecSearch } = require('./search/sqlite-vec');
const { getConfig } = require('./config/defaults');
const { OllamaSetup } = require('./utils/ollama-setup');
const fs = require('fs');
const path = require('path');

class VecStoreFactory {
  static detectOptimalModel(dirPath = process.cwd(), provider = 'vllm') {
    const codeRepoIndicators = [
      'package.json',
      'tsconfig.json',
      'Cargo.toml',
      'requirements.txt',
      'pyproject.toml',
      'pom.xml',
      'build.gradle'
    ];

    const isCodeRepo = codeRepoIndicators.some(indicator =>
      fs.existsSync(path.join(dirPath, indicator))
    );

    if (provider === 'vllm') {
      return isCodeRepo ? 'BAAI/bge-base-en-v1.5' : 'BAAI/bge-base-en-v1.5';
    } else {
      return isCodeRepo ? 'unclemusclez/jina-embeddings-v2-base-code' : 'embeddinggemma';
    }
  }

  static async create(options = {}) {
    const config = getConfig(options);

    // Auto-detect optimal model if not explicitly provided
    if (!options.modelName) {
      const detectedModel = this.detectOptimalModel(options.directory || process.cwd(), config.embedderProvider);
      config.modelName = detectedModel;
    }

    let embedder;

    if (config.embedderProvider === 'vllm') {
      // Create vLLM embedder
      embedder = new VLLMEmbedder({
        modelName: config.modelName,
        host: config.host
      });

      // Check if vLLM server is running
      const connected = await embedder.checkConnection();
      if (!connected) {
        throw new Error(
          `Cannot connect to vLLM server at ${config.host}.\n` +
          `Please start vLLM with: python -m vllm.entrypoints.openai.api_server --model ${config.modelName} --port 8000\n` +
          `Or use Ollama by setting embedderProvider: 'ollama'`
        );
      }
    } else if (config.embedderProvider === 'ollama') {
      // Create Ollama embedder - prefer external Ollama server
      embedder = new OllamaEmbedder({
        modelName: config.modelName,
        host: config.ollamaHost
      });

      // Check if external Ollama is running
      const connected = await embedder.checkConnection();
      if (!connected) {
        // Only auto-setup if explicitly requested via config
        if (config.autoSetupOllama === false) {
          throw new Error(
            `Cannot connect to Ollama server at ${config.ollamaHost}.\n` +
            `Please start Ollama with: ollama serve\n` +
            `Then pull the model: ollama pull ${config.modelName}`
          );
        }

        // On-demand setup: install and start local Ollama if external not available
        console.error('⚙️  Ollama not running, setting up local instance...');
        const setup = new OllamaSetup();
        await setup.ensureOllamaReady(config.modelName);
      }
    } else {
      throw new Error(`Unknown embedder provider: ${config.embedderProvider}. Use 'vllm' or 'ollama'.`);
    }

    const store = new SQLiteStorageAdapter(config.dbPath);
    const search = new SqliteVecSearch(store.db);

    const vecStore = new VecStore({
      embedder,
      store,
      search,
      storeContent: config.storeContent,
      embedBatchSize: config.embedBatchSize,
      embedConcurrency: config.embedConcurrency,
      bufferSize: config.bufferSize || 100,
      flushDelay: config.flushDelay || 1000
    });

    await vecStore.initialize();

    return vecStore;
  }
}

module.exports = { VecStoreFactory };
