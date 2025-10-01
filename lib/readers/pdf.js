'use strict';

const { getDocumentProxy, extractText } = require('unpdf');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

class PDFReader {
  constructor(options = {}) {
    this.document = null;
    this.pdfPath = null;
    this.useOCR = options.useOCR !== false;
    this.ocrLanguage = options.ocrLanguage || 'eng';
    this.ocrWorker = null;
    this.parallelPages = options.parallelPages || 5;
  }

  async load(pdfPath) {
    this.pdfPath = pdfPath;
    const buffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(buffer);
    this.document = await getDocumentProxy(uint8Array, {
      standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
    });
    return this;
  }

  async loadFromBuffer(buffer) {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.document = await getDocumentProxy(uint8Array, {
      standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
    });
    return this;
  }

  getPageCount() {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }
    return this.document.numPages;
  }

  async extractPage(pageNumber) {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }

    if (pageNumber < 1 || pageNumber > this.document.numPages) {
      throw new Error(`Page ${pageNumber} out of range. PDF has ${this.document.numPages} pages.`);
    }

    const page = await this.document.getPage(pageNumber);
    const textContent = await page.getTextContent();

    let text = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let usedOCR = false;

    const useOCRFallback = this.useOCR && this.pdfPath && text.length < 200;
    if (useOCRFallback) {
      const ocrText = await this.extractPageWithOCR(pageNumber);
      if (ocrText.length > text.length) {
        text = ocrText;
        usedOCR = true;
      }
    }

    return {
      pageNumber,
      text,
      metadata: {
        width: page.view[2],
        height: page.view[3],
        ocr: usedOCR
      }
    };
  }

  async getOCRWorker() {
    if (!this.ocrWorker) {
      this.ocrWorker = await createWorker(this.ocrLanguage);
    }
    return this.ocrWorker;
  }

  async extractPageWithOCR(pageNumber) {
    if (!this.pdfPath) {
      return '';
    }

    const tempDir = os.tmpdir();
    const baseName = path.basename(this.pdfPath, '.pdf');
    const outputPrefix = path.join(tempDir, `${baseName}-page${pageNumber}`);

    try {
      execSync(`pdftoppm -f ${pageNumber} -l ${pageNumber} -r 150 "${this.pdfPath}" "${outputPrefix}"`, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const files = fs.readdirSync(tempDir);
      const imageFile = files.find(f => f.startsWith(`${baseName}-page${pageNumber}-`) && f.endsWith('.ppm'));

      if (!imageFile) {
        return '';
      }

      const imagePath = path.join(tempDir, imageFile);

      const worker = await this.getOCRWorker();
      const { data: { text } } = await worker.recognize(imagePath);

      try {
        fs.unlinkSync(imagePath);
      } catch (e) {}

      return text.trim();
    } catch (error) {
      console.error(`OCR error for page ${pageNumber}:`, error.message);
      try {
        const files = fs.readdirSync(tempDir);
        const imageFiles = files.filter(f => f.startsWith(`${baseName}-page${pageNumber}-`) && f.endsWith('.ppm'));
        imageFiles.forEach(f => {
          try {
            fs.unlinkSync(path.join(tempDir, f));
          } catch (e) {}
        });
      } catch (e) {}
      return '';
    }
  }

  async extractAllPages() {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }

    const numPages = this.document.numPages;
    const pages = new Array(numPages);

    for (let i = 0; i < numPages; i += this.parallelPages) {
      const batch = [];
      for (let j = 0; j < this.parallelPages && i + j < numPages; j++) {
        batch.push(this.extractPage(i + j + 1));
      }
      const results = await Promise.all(batch);
      for (let j = 0; j < results.length; j++) {
        pages[i + j] = results[j];
      }
    }

    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }

    return pages;
  }

  async extractText() {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }

    const text = await extractText(this.document);
    return text;
  }

  async toMarkdown() {
    const pages = await this.extractAllPages();

    let markdown = '';
    for (const page of pages) {
      if (page.text.trim()) {
        markdown += `## Page ${page.pageNumber}\n\n`;
        markdown += `${page.text}\n\n`;
        markdown += '---\n\n';
      }
    }

    return markdown.trim();
  }

  async extractPageRange(startPage, endPage) {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }

    if (startPage < 1 || endPage > this.document.numPages || startPage > endPage) {
      throw new Error(`Invalid page range: ${startPage}-${endPage}. PDF has ${this.document.numPages} pages.`);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      const pageData = await this.extractPage(i);
      pages.push(pageData);
    }
    return pages;
  }
}

module.exports = { PDFReader };