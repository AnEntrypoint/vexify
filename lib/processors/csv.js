'use strict';

const fs = require('fs');
const Papa = require('papaparse');
const { BaseProcessor } = require('./base');

class CsvProcessor extends BaseProcessor {
  static get extensions() {
    return ['.csv'];
  }

  async process(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.processContent(content, filePath);
  }

  async processBuffer(buffer, fileName) {
    const content = buffer.toString('utf-8');
    return this.processContent(content, fileName);
  }

  processContent(csvContent, filePath) {
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });

    if (parsed.errors.length > 0) {
      throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
    }

    return parsed.data.map((row, index) => {
      const text = Object.entries(row)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      return {
        id: this.generateDocumentId(filePath, index),
        content: text,
        metadata: this.createMetadata(filePath, {
          type: 'csv',
          rowIndex: index,
          rowData: row,
          columns: Object.keys(row)
        })
      };
    });
  }
}

module.exports = { CsvProcessor };
