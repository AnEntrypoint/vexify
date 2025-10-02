'use strict';

class TextDeduplicator {
  constructor(minChunkSize = 100, minOccurrences = 3) {
    this.minChunkSize = minChunkSize;
    this.minOccurrences = minOccurrences;
    this.commonPhrases = new Map();
    this.analyzed = false;
  }

  analyzeDocuments(documents) {
    this.commonPhrases.clear();

    for (const doc of documents) {
      const phrases = this.extractPhrases(doc);
      const seen = new Set();

      for (const phrase of phrases) {
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        this.commonPhrases.set(phrase, (this.commonPhrases.get(phrase) || 0) + 1);
      }
    }

    const toRemove = [];
    for (const [phrase, count] of this.commonPhrases.entries()) {
      if (count < this.minOccurrences) {
        toRemove.push(phrase);
      }
    }

    for (const phrase of toRemove) {
      this.commonPhrases.delete(phrase);
    }

    this.analyzed = true;
    return this.commonPhrases.size;
  }

  extractPhrases(text) {
    const phrases = new Set();
    const normalized = text.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');

    for (let wordCount = 3; wordCount <= 15; wordCount++) {
      for (let i = 0; i <= words.length - wordCount; i++) {
        const phrase = words.slice(i, i + wordCount).join(' ');
        if (phrase.length >= this.minChunkSize) {
          phrases.add(phrase);
        }
      }
    }

    return Array.from(phrases);
  }

  deduplicate(text) {
    if (!this.analyzed || this.commonPhrases.size === 0) {
      return text;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    let result = normalized;
    const sortedPhrases = Array.from(this.commonPhrases.keys()).sort((a, b) => b.length - a.length);

    for (const phrase of sortedPhrases) {
      result = result.split(phrase).join('');
    }

    return result.replace(/\s+/g, ' ').trim();
  }

  getStats() {
    return {
      commonPhrases: this.commonPhrases.size,
      analyzed: this.analyzed
    };
  }
}

module.exports = { TextDeduplicator };
