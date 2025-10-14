'use strict';

const officeParser = require('officeparser');
const { BaseProcessor } = require('./base');

class DocxProcessor extends BaseProcessor {
  static get extensions() {
    return ['.docx', '.doc'];
  }

  async process(filePath) {
    const text = await officeParser.parseOfficeAsync(filePath);
    return this.processContent(text, filePath);
  }

  async processBuffer(buffer, fileName) {
    const text = await officeParser.parseOfficeAsync(buffer);
    return this.processContent(text, fileName);
  }

  processContent(text, filePath) {
    const content = text.trim();

    if (!content) {
      return [];
    }

    const paragraphs = content.split('\n\n').filter(p => p.trim());

    if (paragraphs.length <= 3) {
      return [{
        id: this.generateDocumentId(filePath),
        content,
        metadata: this.createMetadata(filePath, {
          type: 'docx',
          length: content.length
        })
      }];
    }

    return paragraphs.map((paragraph, index) => ({
      id: this.generateDocumentId(filePath, index),
      content: paragraph.trim(),
      metadata: this.createMetadata(filePath, {
        type: 'docx',
        paragraphIndex: index,
        paragraphLength: paragraph.length
      })
    }));
  }
}

module.exports = { DocxProcessor };
