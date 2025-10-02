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

    const embedder = new OllamaEmbedder({
      modelName: config.modelName,
      host: config.ollamaHost
    });

    const connected = await embedder.checkConnection();
    if (!connected) {
      console.log('⚙️  Ollama not running, setting up...');
      const setup = new OllamaSetup();
      await setup.ensureOllamaReady(config.modelName);
    }

    const store = new SQLiteStorageAdapter(config.dbPath);

    const search = new SqliteVecSearch(store.db);

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
