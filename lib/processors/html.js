'use strict';

const fs = require('fs');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const { BaseProcessor } = require('./base');

class HtmlProcessor extends BaseProcessor {
  static get extensions() {
    return ['.html', '.htm'];
  }

  async process(filePath, options = {}) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.processContent(content, filePath, options);
  }

  async processBuffer(buffer, fileName, options = {}) {
    const content = buffer.toString('utf-8');
    return this.processContent(content, fileName, options);
  }

  processContent(htmlContent, filePath, options = {}) {
    const markdown = NodeHtmlMarkdown.translate(htmlContent);
    const text = markdown.trim();

    if (!text) {
      return [];
    }

    const metadata = {
      type: 'html',
      format: 'markdown',
      originalLength: htmlContent.length,
      convertedLength: text.length
    };

    if (options.url) {
      metadata.crawlUrl = options.url;
    }

    return [{
      id: this.generateDocumentId(filePath),
      content: text,
      metadata: this.createMetadata(filePath, metadata)
    }];
  }
}

module.exports = { HtmlProcessor };
