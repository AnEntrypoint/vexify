'use strict';

const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');

class VecStore {
  constructor(options) {
    this.embedder = options.embedder;
    this.store = options.store || new SQLiteStorageAdapter(options.dbName || './vecstore.db');
    this.search = options.search || new CosineSearchAlgorithm();
    this.storeContent = options.storeContent ?? true;
  }

  async addDocument(id, content, metadata) {
    const vector = await this.embedder.embed(content);

    const doc = {
      id,
      vector,
      ...(this.storeContent && { content }),
      metadata
    };

    await this.store.put(doc);

    if (this.isIndexedSearch(this.search)) {
      await this.search.addDocument(doc);
    }
  }

  async query(queryContent, topK = 5) {
    const queryVec = await this.embedder.embed(queryContent);

    if (this.isIndexedSearch(this.search)) {
      return this.search.searchIndex(queryVec, topK);
    }

    const allDocs = await this.store.getAll();
    return this.search.search(queryVec, allDocs, topK);
  }

  isIndexedSearch(search) {
    return 'addDocument' in search && 'searchIndex' in search && 'initialize' in search;
  }

  async initialize() {
    if (this.isIndexedSearch(this.search)) {
      await this.search.initialize();

      const existingDocs = await this.store.getAll();
      for (const doc of existingDocs) {
        await this.search.addDocument(doc);
      }
    }
  }
}

module.exports = { VecStore };