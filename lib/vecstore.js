'use strict';

const crypto = require('crypto');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');

class VecStore {
  constructor(options) {
    this.embedder = options.embedder;
    this.store = options.store || new SQLiteStorageAdapter(options.dbName || './vecstore.db');
    this.search = options.search || new CosineSearchAlgorithm();
    this.storeContent = options.storeContent ?? true;
  }

  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async addDocument(id, content, metadata) {
    const checksum = this.calculateChecksum(content);

    const existingId = await this.store.getByChecksum(checksum);
    if (existingId) {
      return { skipped: true, reason: 'duplicate', existingId, checksum };
    }

    const vector = await this.embedder.embed(content);

    const doc = {
      id,
      vector,
      checksum,
      ...(this.storeContent && { content }),
      metadata
    };

    await this.store.put(doc);

    if (this.isIndexedSearch(this.search)) {
      await this.search.addDocument(doc);
    }

    return { skipped: false, id, checksum };
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