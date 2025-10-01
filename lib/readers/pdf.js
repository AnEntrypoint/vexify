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
  }

  async load(pdfPath) {
    this.pdfPath = pdfPath;
    const buffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(buffer);
    this.document = await getDocumentProxy(uint8Array);
    return this;
  }

  async loadFromBuffer(buffer) {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.document = await getDocumentProxy(uint8Array);
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

    // If no text or very little text extracted and OCR is enabled, try OCR
    // Pages with <100 chars likely have text in undecodable images (JPEG2000)
    const useOCRFallback = this.useOCR && this.pdfPath && text.length < 100;
    if (useOCRFallback) {
      const ocrText = await this.extractPageWithOCR(pageNumber);
      // Use OCR text if it's substantially longer
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

  async extractPageWithOCR(pageNumber) {
    if (!this.pdfPath) {
      return '';
    }

    const tempDir = os.tmpdir();
    const baseName = path.basename(this.pdfPath, '.pdf');
    const outputPrefix = path.join(tempDir, `${baseName}-page${pageNumber}`);

    try {
      // Use pdftoppm to convert PDF page to image (handles JPEG2000 properly)
      execSync(`pdftoppm -f ${pageNumber} -l ${pageNumber} -r 150 "${this.pdfPath}" "${outputPrefix}"`, {
        stdio: ['pipe', 'pipe', 'pipe'] // Suppress all output
      });

      // Find the generated image file (pdftoppm adds page number suffix with leading zeros)
      const files = fs.readdirSync(tempDir);
      const imageFile = files.find(f => f.startsWith(`${baseName}-page${pageNumber}-`) && f.endsWith('.ppm'));

      if (!imageFile) {
        return '';
      }

      const imagePath = path.join(tempDir, imageFile);

      // Perform OCR on the image
      const worker = await createWorker(this.ocrLanguage);
      const { data: { text } } = await worker.recognize(imagePath);
      await worker.terminate();

      // Clean up temp file
      try {
        fs.unlinkSync(imagePath);
      } catch (e) {
        // Ignore cleanup errors
      }

      return text.trim();
    } catch (error) {
      console.error(`OCR error for page ${pageNumber}:`, error.message);
      // Clean up any temp files on error
      try {
        const files = fs.readdirSync(tempDir);
        const imageFiles = files.filter(f => f.startsWith(`${baseName}-page${pageNumber}-`) && f.endsWith('.ppm'));
        imageFiles.forEach(f => {
          try {
            fs.unlinkSync(path.join(tempDir, f));
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      } catch (e) {
        // Ignore cleanup errors
      }
      return '';
    }
  }

  async extractAllPages() {
    if (!this.document) {
      throw new Error('No PDF loaded. Call load() or loadFromBuffer() first.');
    }

    const pages = [];
    for (let i = 1; i <= this.document.numPages; i++) {
      const pageData = await this.extractPage(i);
      pages.push(pageData);
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