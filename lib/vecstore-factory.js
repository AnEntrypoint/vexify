'use strict';

const { VecStore } = require('./vecstore');
const { TransformerEmbedder } = require('./embedders/transformer');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');
const { getConfig } = require('./config/defaults');

class VecStoreFactory {
  static async create(options = {}) {
    const config = getConfig(options);

    const embedder = await TransformerEmbedder.create(config.modelName);

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
