'use strict';

class EmbeddingQueue {
  constructor(embedder, options = {}) {
    this.embedder = embedder;
    this.batchSize = options.batchSize || 32;
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = options.maxConcurrent || 4;
    this.activeBatches = 0;
  }

  async embed(text) {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, resolve, reject });
      this.processBatches();
    });
  }

  async processBatches() {
    if (this.processing || this.activeBatches >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0 && this.activeBatches < this.maxConcurrent) {
      const batchSize = Math.min(this.batchSize, this.queue.length);
      const batch = this.queue.splice(0, batchSize);

      this.activeBatches++;
      this.processBatch(batch).finally(() => {
        this.activeBatches--;
        this.processBatches();
      });
    }

    this.processing = false;
  }

  async processBatch(batch) {
    try {
      const embeddings = await Promise.all(
        batch.map(item => this.embedder.embed(item.text))
      );

      batch.forEach((item, i) => {
        item.resolve(embeddings[i]);
      });
    } catch (error) {
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }

  async drain() {
    while (this.queue.length > 0 || this.activeBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

module.exports = { EmbeddingQueue };
