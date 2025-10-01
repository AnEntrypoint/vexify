'use strict';

const fs = require('fs');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const { BaseProcessor } = require('./base');

class HtmlProcessor extends BaseProcessor {
  static get extensions() {
    return ['.html', '.htm'];
  }

  async process(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.processContent(content, filePath);
  }

  async processBuffer(buffer, fileName) {
    const content = buffer.toString('utf-8');
    return this.processContent(content, fileName);
  }

  processContent(htmlContent, filePath) {
    const markdown = NodeHtmlMarkdown.translate(htmlContent);
    const text = markdown.trim();

    if (!text) {
      return [];
    }

    return [{
      id: this.generateDocumentId(filePath),
      content: text,
      metadata: this.createMetadata(filePath, {
        type: 'html',
        format: 'markdown',
        originalLength: htmlContent.length,
        convertedLength: text.length
      })
    }];
  }
}

module.exports = { HtmlProcessor };
