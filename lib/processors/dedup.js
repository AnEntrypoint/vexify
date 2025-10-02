'use strict';

class TextDeduplicator {
  constructor(minChunkSize = 100, minOccurrences = 3) {
    this.minChunkSize = minChunkSize;
    this.minOccurrences = minOccurrences;
    this.chunkCounts = new Map();
    this.commonChunks = new Set();
    this.analyzed = false;
  }

  analyzeDocuments(documents) {
    this.chunkCounts.clear();
    this.commonChunks.clear();

    for (const doc of documents) {
      const chunks = this.extractChunks(doc);
      const seen = new Set();

      for (const chunk of chunks) {
        if (seen.has(chunk)) continue;
        seen.add(chunk);
        this.chunkCounts.set(chunk, (this.chunkCounts.get(chunk) || 0) + 1);
      }
    }

    for (const [chunk, count] of this.chunkCounts.entries()) {
      if (count >= this.minOccurrences) {
        this.commonChunks.add(chunk);
      }
    }

    this.analyzed = true;
    return this.commonChunks.size;
  }

  extractChunks(text, size = this.minChunkSize) {
    const chunks = [];
    const normalized = text.replace(/\s+/g, ' ').trim();

    for (let i = 0; i <= normalized.length - size; i += Math.floor(size / 2)) {
      chunks.push(normalized.slice(i, i + size));
    }

    return chunks;
  }

  deduplicate(text) {
    if (!this.analyzed) {
      return text;
    }

    let result = text;
    const sortedChunks = Array.from(this.commonChunks).sort((a, b) => b.length - a.length);

    for (const chunk of sortedChunks) {
      const regex = new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, '');
    }

    return result.replace(/\s+/g, ' ').trim();
  }

  getStats() {
    return {
      totalChunks: this.chunkCounts.size,
      commonChunks: this.commonChunks.size,
      analyzed: this.analyzed
    };
  }
}

module.exports = { TextDeduplicator };
