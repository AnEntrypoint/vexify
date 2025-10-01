'use strict';

class BaseProcessor {
  constructor() {
    if (this.constructor === BaseProcessor) {
      throw new Error('BaseProcessor is abstract');
    }
  }

  static get extensions() {
    throw new Error('extensions getter must be implemented');
  }

  async process(filePath) {
    throw new Error('process method must be implemented');
  }

  async processBuffer(buffer, fileName) {
    throw new Error('processBuffer method must be implemented');
  }

  generateDocumentId(filePath, index = null) {
    const suffix = index !== null ? `:${index}` : '';
    return `file:${filePath}${suffix}`;
  }

  createMetadata(filePath, additional = {}) {
    const path = require('path');
    const metadata = {
      source: 'file',
      filePath,
      fileName: path.basename(filePath),
      processedAt: new Date().toISOString(),
      pageNumber: additional.pageNumber || 1,
      ...additional
    };

    if (additional.crawlUrl) {
      metadata.source = 'crawl';
      metadata.crawlUrl = additional.crawlUrl;
    }

    return metadata;
  }
}

module.exports = { BaseProcessor };
