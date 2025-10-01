'use strict';

const fs = require('fs');
const { BaseProcessor } = require('./base');

class JsonProcessor extends BaseProcessor {
  static get extensions() {
    return ['.json', '.jsonl'];
  }

  async process(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const isJsonLines = filePath.endsWith('.jsonl');
    return this.processContent(content, filePath, isJsonLines);
  }

  async processBuffer(buffer, fileName) {
    const content = buffer.toString('utf-8');
    const isJsonLines = fileName.endsWith('.jsonl');
    return this.processContent(content, fileName, isJsonLines);
  }

  processContent(jsonContent, filePath, isJsonLines) {
    if (isJsonLines) {
      return this.processJsonLines(jsonContent, filePath);
    }
    return this.processJson(jsonContent, filePath);
  }

  processJson(jsonContent, filePath) {
    const data = JSON.parse(jsonContent);

    if (Array.isArray(data)) {
      return data.map((item, index) => this.createDocument(item, filePath, index));
    }

    return [this.createDocument(data, filePath)];
  }

  processJsonLines(jsonlContent, filePath) {
    const lines = jsonlContent.trim().split('\n');
    return lines.map((line, index) => {
      const item = JSON.parse(line);
      return this.createDocument(item, filePath, index);
    });
  }

  createDocument(item, filePath, index = null) {
    const text = this.extractText(item);

    return {
      id: this.generateDocumentId(filePath, index),
      content: text,
      metadata: this.createMetadata(filePath, {
        type: 'json',
        itemIndex: index,
        itemData: item
      })
    };
  }

  extractText(obj) {
    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj !== 'object' || obj === null) {
      return String(obj);
    }

    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');
  }
}

module.exports = { JsonProcessor };
