'use strict';

const crypto = require('crypto');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { SqliteVecSearch } = require('./search/sqlite-vec');
const { EmbeddingQueue } = require('./utils/embedding-queue');

class VecStore {
  constructor(options) {
    this.embedder = options.embedder;
    this.embeddingQueue = options.embeddingQueue || new EmbeddingQueue(options.embedder, {
      batchSize: options.embedBatchSize || 1,
      maxConcurrent: options.embedConcurrency || 1
    });
    this.store = options.store || new SQLiteStorageAdapter(options.dbName || './vecstore.db');
    this.search = options.search || new SqliteVecSearch(this.store.db);
    this.storeContent = options.storeContent ?? true;
    this.version = options.version || require('../package.json').version;

    this.documentBuffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.flushTimeout = null;
    this.flushDelay = options.flushDelay || 1000;
  }

  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async addDocument(id, content, metadata) {
    if (content.length < 150) {
      return { skipped: true, reason: 'too_short', length: content.length };
    }

    const checksum = this.calculateChecksum(content);
    const vector = await this.embeddingQueue.embed(content);

    const doc = {
      id,
      vector,
      checksum,
      version: this.version,
      ...(this.storeContent && { content }),
      metadata
    };

    this.documentBuffer.push(doc);

    if (this.documentBuffer.length >= this.bufferSize) {
      await this.flushBuffer();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flushBuffer(), this.flushDelay);
    }

    return { skipped: false, id, checksum };
  }

  async flushBuffer() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.documentBuffer.length === 0) return;

    const docs = this.documentBuffer.splice(0);
    const checksums = docs.map(d => d.checksum);
    const existingChecksums = await this.store.getExistingChecksums(checksums);
    const existingSet = new Set(existingChecksums);
    const uniqueDocs = docs.filter(doc => !existingSet.has(doc.checksum));

    if (uniqueDocs.length === 0) return;

    await this.store.putBatch(uniqueDocs);

    if (this.isIndexedSearch(this.search)) {
      await Promise.all(uniqueDocs.map(doc => this.search.addDocument(doc)));
    }
  }

  async drain() {
    // Wait for all pending embeddings to complete
    await this.embeddingQueue.drain();
    // Then flush any remaining documents in the buffer
    await this.flushBuffer();
  }

  async clearSource(sourceType, sourceValue) {
    await this.flushBuffer();
    const ids = await this.store.getBySource(sourceType, sourceValue);
    await this.store.deleteByIds(ids);
    return ids.length;
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
      const existingIds = await this.search.getAllIds();
      const idsSet = new Set(existingIds);

      for (const doc of existingDocs) {
        if (!idsSet.has(doc.id)) {
          await this.search.addDocument(doc);
        }
      }
    }
  }
}

module.exports = { VecStore };