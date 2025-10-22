'use strict';

const crypto = require('crypto');
const { BaseProcessor } = require('./base');

// Lazy-load heavy dependencies to avoid blocking on module import
let JSDOM, Readability, NodeHtmlMarkdown;
function loadDependencies() {
  if (!JSDOM) {
    ({ JSDOM } = require('jsdom'));
    ({ Readability } = require('@mozilla/readability'));
    ({ NodeHtmlMarkdown } = require('node-html-markdown'));
  }
}

class HtmlProcessor extends BaseProcessor {
  static get extensions() {
    return ['.html', '.htm'];
  }

  async process(filePath, options = {}) {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.processContent(content, filePath, options);
  }

  async processBuffer(buffer, fileName, options = {}) {
    const content = buffer.toString('utf-8');
    return this.processContent(content, fileName, options);
  }

  removeBoilerplate(text) {
    const patterns = [
      /important:.*?please read/gi,
      /disclaimer.*?policy/gi,
      /privacy policy.*?terms/gi,
      /copyright.*?\d{4}/gi,
      /all rights reserved/gi,
      /watch.*?online.*?dub.*?anime/gi,
      /log-?in.*?register/gi,
      /mobile html.*?player/gi
    ];

    let cleaned = text;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.replace(/\s+/g, ' ').trim();
  }

  processContent(htmlContent, filePath, options = {}) {
    loadDependencies();
    const dom = new JSDOM(htmlContent, { url: options.url || 'http://localhost' });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let text;
    let title = '';

    if (article && article.content) {
      text = article.textContent.trim();
      title = article.title || '';
      text = this.removeBoilerplate(text);
    } else {
      const markdown = NodeHtmlMarkdown.translate(htmlContent);
      text = this.removeBoilerplate(markdown.trim());
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
    metadata.contentHash = crypto.createHash('sha256').update(finalContent).digest('hex');

    return [{
      id: this.generateDocumentId(filePath),
      content: finalContent,
      metadata: this.createMetadata(filePath, metadata)
    }];
  }
}

module.exports = { HtmlProcessor };
