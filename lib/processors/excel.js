'use strict';

const { BaseProcessor } = require('./base');

// Lazy-load ExcelJS to avoid blocking on module import
let ExcelJS = null;
function getExcelJS() {
  if (!ExcelJS) {
    ExcelJS = require('exceljs');
  }
  return ExcelJS;
}

class ExcelProcessor extends BaseProcessor {
  static get extensions() {
    return ['.xlsx', '.xls'];
  }

  async process(filePath) {
    const ExcelJS = getExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return this.processWorkbook(workbook, filePath);
  }

  async processBuffer(buffer, fileName) {
    const ExcelJS = getExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return this.processWorkbook(workbook, fileName);
  }

  processWorkbook(workbook, filePath) {
    const documents = [];

    workbook.eachSheet((worksheet, sheetId) => {
      const sheetName = worksheet.name;
      const rows = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = worksheet.getRow(1).getCell(colNumber).value;
          rowData[header || `Column${colNumber}`] = cell.value;
        });

        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });

      rows.forEach((rowData, index) => {
        const text = Object.entries(rowData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');

        documents.push({
          id: this.generateDocumentId(filePath, `${sheetName}_${index}`),
          content: text,
          metadata: this.createMetadata(filePath, {
            type: 'excel',
            sheetName,
            sheetId,
            rowIndex: index,
            rowData
          })
        });
      });
    });

    return documents;
  }
}

module.exports = { ExcelProcessor };
