'use strict';

const { PDFReader } = require('../readers/pdf');

class PDFEmbedder {
  constructor(vecStore, pdfReader) {
    this.vecStore = vecStore;
    this.pdfReader = pdfReader || new PDFReader();
  }

  async embedPDF(pdfPath, options = {}) {
    const {
      pdfName = pdfPath.split('/').pop(),
      chunkSize = null,
      includePageMetadata = true
    } = options;

    await this.pdfReader.load(pdfPath);
    const pages = await this.pdfReader.extractAllPages();

    const results = [];

    for (const page of pages) {
      if (!page.text.trim()) continue;

      const docId = `${pdfName}:page:${page.pageNumber}`;

      const metadata = {
        source: 'pdf',
        pdfName,
        pageNumber: page.pageNumber,
        totalPages: pages.length,
        ...(includePageMetadata && { pageMetadata: page.metadata })
      };

      await this.vecStore.addDocument(docId, page.text, metadata);

      results.push({
        id: docId,
        pageNumber: page.pageNumber,
        textLength: page.text.length
      });
    }

    return {
      pdfName,
      totalPages: pages.length,
      embeddedPages: results.length,
      pages: results
    };
  }

  async embedPDFFromBuffer(buffer, pdfName, options = {}) {
    const {
      chunkSize = null,
      includePageMetadata = true
    } = options;

    await this.pdfReader.loadFromBuffer(buffer);
    const pages = await this.pdfReader.extractAllPages();

    const results = [];

    for (const page of pages) {
      if (!page.text.trim()) continue;

      const docId = `${pdfName}:page:${page.pageNumber}`;

      const metadata = {
        source: 'pdf',
        pdfName,
        pageNumber: page.pageNumber,
        totalPages: pages.length,
        ...(includePageMetadata && { pageMetadata: page.metadata })
      };

      await this.vecStore.addDocument(docId, page.text, metadata);

      results.push({
        id: docId,
        pageNumber: page.pageNumber,
        textLength: page.text.length
      });
    }

    return {
      pdfName,
      totalPages: pages.length,
      embeddedPages: results.length,
      pages: results
    };
  }

  async embedPDFPageRange(pdfPath, startPage, endPage, options = {}) {
    const {
      pdfName = pdfPath.split('/').pop(),
      includePageMetadata = true
    } = options;

    await this.pdfReader.load(pdfPath);
    const pages = await this.pdfReader.extractPageRange(startPage, endPage);

    const results = [];

    for (const page of pages) {
      if (!page.text.trim()) continue;

      const docId = `${pdfName}:page:${page.pageNumber}`;

      const metadata = {
        source: 'pdf',
        pdfName,
        pageNumber: page.pageNumber,
        totalPages: this.pdfReader.getPageCount(),
        ...(includePageMetadata && { pageMetadata: page.metadata })
      };

      await this.vecStore.addDocument(docId, page.text, metadata);

      results.push({
        id: docId,
        pageNumber: page.pageNumber,
        textLength: page.text.length
      });
    }

    return {
      pdfName,
      pageRange: `${startPage}-${endPage}`,
      embeddedPages: results.length,
      pages: results
    };
  }

  async queryWithPageInfo(queryText, topK = 5) {
    const results = await this.vecStore.query(queryText, topK);

    return results.map(result => ({
      id: result.id,
      score: result.score,
      text: result.content,
      pdfName: result.metadata?.pdfName,
      pageNumber: result.metadata?.pageNumber,
      totalPages: result.metadata?.totalPages,
      metadata: result.metadata
    }));
  }
}

module.exports = { PDFEmbedder };