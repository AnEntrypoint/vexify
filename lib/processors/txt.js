'use strict';

const fs = require('fs');
const { BaseProcessor } = require('./base');

class TxtProcessor extends BaseProcessor {
  static get extensions() {
    return ['.txt', '.text', '.md'];
  }

  processContent(content, filePath) {
    const text = content.trim();
    if (!text) {
      return [];
    }

    return [{
      id: this.generateDocumentId(filePath),
      content: text,
      metadata: this.createMetadata(filePath, {
        type: 'text',
        length: text.length
      })
    }];
  }
}

module.exports = { TxtProcessor };
