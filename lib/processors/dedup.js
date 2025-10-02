'use strict';

class TextDeduplicator {
  constructor(minChunkSize = 50, minOccurrences = 2) {
    this.minChunkSize = minChunkSize;
    this.minOccurrences = minOccurrences;
    this.commonPhrases = new Map();
    this.analyzed = false;
    this.maxPhrases = 1000;
  }

  analyzeDocuments(documents) {
    this.commonPhrases.clear();
    const phraseCounts = new Map();

    for (const doc of documents) {
      const phrases = this.extractPhrasesOptimized(doc);
      const seen = new Set();

      for (const phrase of phrases) {
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      }
    }

    const sortedPhrases = Array.from(phraseCounts.entries())
      .filter(([_, count]) => count >= this.minOccurrences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxPhrases);

    for (const [phrase, count] of sortedPhrases) {
      this.commonPhrases.set(phrase, count);
    }

    this.analyzed = true;
    return this.commonPhrases.size;
  }

  extractPhrasesOptimized(text) {
    const phrases = new Set();
    const normalized = text.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');

    if (words.length < 3) return phrases;

    const wordCounts = [3, 5, 7, 10];

    for (const wordCount of wordCounts) {
      if (words.length < wordCount) continue;

      const step = Math.max(1, Math.floor(wordCount / 2));

      for (let i = 0; i <= words.length - wordCount; i += step) {
        const phrase = words.slice(i, i + wordCount).join(' ');
        if (phrase.length >= this.minChunkSize) {
          phrases.add(phrase);
        }
      }
    }

    return phrases;
  }

  deduplicate(text) {
    if (!this.analyzed || this.commonPhrases.size === 0) {
      return text;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    let result = normalized;

    const sortedPhrases = Array.from(this.commonPhrases.keys())
      .sort((a, b) => b.length - a.length);

    for (const phrase of sortedPhrases) {
      if (result.includes(phrase)) {
        result = result.split(phrase).join('');
      }
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
