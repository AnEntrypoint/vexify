'use strict';

const fs = require('fs');
const { BaseProcessor } = require('./base');

class TxtProcessor extends BaseProcessor {
  static get extensions() {
    return ['.txt', '.text', '.md', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
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
        type: filePath.match(/\.(js|jsx|ts|tsx|mjs|cjs)$/) ? 'code' : 'text',
        length: text.length,
        language: this.detectLanguage(filePath)
      })
    }];
  }

  detectLanguage(filePath) {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.ts') || ext.endsWith('.tsx')) return 'typescript';
    if (ext.endsWith('.jsx')) return 'jsx';
    if (ext.endsWith('.mjs')) return 'module';
    if (ext.endsWith('.cjs')) return 'commonjs';
    if (ext.endsWith('.js')) return 'javascript';
    return 'text';
  }
}

module.exports = { TxtProcessor };
