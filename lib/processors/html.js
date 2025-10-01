'use strict';

const fs = require('fs');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
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
    const dom = new JSDOM(htmlContent, { url: options.url || 'http://localhost' });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let text;
    let title = '';

    if (article && article.content) {
      const contentDom = new JSDOM(article.content);
      text = contentDom.window.document.body.textContent.trim();
      title = article.title || '';
    } else {
      const markdown = NodeHtmlMarkdown.translate(htmlContent);
      text = markdown.trim();
    }

    if (!text) {
      return [];
    }

    const metadata = {
      type: 'html',
      format: article ? 'readability' : 'markdown',
      originalLength: htmlContent.length,
      contentLength: text.length
    };

    if (title) {
      metadata.title = title;
    }

    if (options.url) {
      metadata.crawlUrl = options.url;
    }

    const finalContent = title ? `${title}\n\n${text}` : text;

    return [{
      id: this.generateDocumentId(filePath),
      content: finalContent,
      metadata: this.createMetadata(filePath, metadata)
    }];
  }
}

module.exports = { HtmlProcessor };
