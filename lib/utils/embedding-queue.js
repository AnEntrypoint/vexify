'use strict';

class EmbeddingQueue {
  constructor(embedder, options = {}) {
    this.embedder = embedder;
    this.batchSize = options.batchSize || 1;
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = options.maxConcurrent || 2;
    this.activeBatches = 0;
  }

  async embed(text) {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, resolve, reject });
      this.processBatches();
    });
  }

  async processBatches() {
    if (this.processing) return;
    if (this.queue.length === 0 && this.activeBatches === 0) return;

    this.processing = true;

    while (this.queue.length > 0 && this.activeBatches < this.maxConcurrent) {
      const batchSize = Math.min(this.batchSize, this.queue.length);
      const batch = this.queue.splice(0, batchSize);

      this.activeBatches++;

      Promise.resolve(this.processBatch(batch)).finally(() => {
        this.activeBatches--;
        this.processing = false;
        this.processBatches();
      });
    }

    this.processing = false;
  }

  async processBatch(batch) {
    try {
      const embeddings = await Promise.all(
        batch.map(item => this.embedder.embed(item.text).catch(err => {
          console.error('Embedding error:', err.message);
          return null;
        }))
      );

      batch.forEach((item, i) => {
        if (embeddings[i] !== null) {
          item.resolve(embeddings[i]);
        } else {
          item.reject(new Error('Embedding failed'));
        }
      });
    } catch (error) {
      console.error('Batch processing error:', error.message);
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }

  async drain() {
    let iterations = 0;
    const maxWait = 200;

    while (this.queue.length > 0 || this.activeBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      iterations++;

      if (iterations >= maxWait) {
        if (this.activeBatches > 0 || this.queue.length > 0) {
          console.warn(`Warning: ${this.activeBatches} batch(es) active, ${this.queue.length} queued after 20s timeout`);
        }
        break;
      }
    }
  }
}

module.exports = { EmbeddingQueue };
