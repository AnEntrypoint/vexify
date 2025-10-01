'use strict';

const { VecStore } = require('./vecstore');
const { OllamaEmbedder } = require('./embedders/ollama');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');
const { getConfig } = require('./config/defaults');
const { OllamaSetup } = require('./utils/ollama-setup');

class VecStoreFactory {
  static async create(options = {}) {
    const config = getConfig(options);

    const embedder = new OllamaEmbedder({
      modelName: config.modelName || 'all-minilm',
      host: config.ollamaHost || 'http://localhost:11434'
    });

    const connected = await embedder.checkConnection();
    if (!connected) {
      console.log('⚙️  Ollama not running, setting up...');
      const setup = new OllamaSetup();
      await setup.ensureOllamaReady(config.modelName || 'all-minilm');
    }

    const store = new SQLiteStorageAdapter(config.dbPath);

    const search = new CosineSearchAlgorithm();

    const vecStore = new VecStore({
      embedder,
      store,
      search,
      storeContent: config.storeContent
    });

    await vecStore.initialize();

    return vecStore;
  }
}

module.exports = { VecStoreFactory };
