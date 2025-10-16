'use strict';

const { VecStore } = require('./vecstore');
const { OllamaEmbedder } = require('./embedders/ollama');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { SqliteVecSearch } = require('./search/sqlite-vec');
const { getConfig } = require('./config/defaults');
const { OllamaSetup } = require('./utils/ollama-setup');

class VecStoreFactory {
  static async create(options = {}) {
    const config = getConfig(options);

    // Create Ollama embedder - prefer external Ollama server
    const embedder = new OllamaEmbedder({
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
