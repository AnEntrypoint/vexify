'use strict';

const { PDFReader } = require('../readers/pdf');
const { BaseProcessor } = require('./base');

class PdfProcessor extends BaseProcessor {
  static get extensions() {
    return ['.pdf'];
  }

  async process(filePath) {
    const reader = new PDFReader();
    await reader.load(filePath);
    return this.processReader(reader, filePath);
  }

  async processBuffer(buffer, fileName) {
    const reader = new PDFReader();
    await reader.loadFromBuffer(buffer);
    return this.processReader(reader, fileName);
  }

  async processReader(reader, filePath) {
    const pageCount = reader.getPageCount();
    const documents = [];

    const pages = await reader.extractAllPages();

    for (const pageData of pages) {
      const text = pageData.text.trim();

      if (text) {
        documents.push({
          id: this.generateDocumentId(filePath, `page:${pageData.pageNumber}`),
          content: text,
          metadata: this.createMetadata(filePath, {
            type: 'pdf',
            pageNumber: pageData.pageNumber,
            totalPages: pageCount,
            pageMetadata: pageData.metadata
          })
        });
      }
    }

    return documents;
  }
}

module.exports = { PdfProcessor };
