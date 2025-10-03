'use strict';

const { PDFReader } = require('../readers/pdf');
const { BaseProcessor } = require('./base');

class PdfProcessor extends BaseProcessor {
  static get extensions() {
    return ['.pdf'];
  }

  async process(filePath, options = {}) {
    const reader = new PDFReader({ useOCR: false });
    await reader.load(filePath);
    return this.processReader(reader, filePath, options);
  }

  async processBuffer(buffer, fileName, options = {}) {
    const reader = new PDFReader({ useOCR: false });
    await reader.loadFromBuffer(buffer);
    return this.processReader(reader, fileName, options);
  }

  async processReader(reader, filePath, options = {}) {
    const pageCount = reader.getPageCount();
    const documents = [];

    const pages = await reader.extractAllPages();

    for (const pageData of pages) {
      const text = pageData.text.trim();

      if (text) {
        const metadata = this.createMetadata(filePath, {
          type: 'pdf',
          pageNumber: pageData.pageNumber,
          totalPages: pageCount,
          pageMetadata: pageData.metadata
        });

        if (options.url) {
          metadata.crawlUrl = options.url;
        }

        documents.push({
          id: this.generateDocumentId(filePath, `page:${pageData.pageNumber}`),
          content: text,
          metadata
        });
      }
    }

    return documents;
  }
}

module.exports = { PdfProcessor };
