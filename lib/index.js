'use strict';

const { VecStore } = require('./vecstore');
const { TransformerEmbedder } = require('./embedders/transformer');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');
const { PDFReader } = require('./readers/pdf');
const { PDFEmbedder } = require('./utils/pdf-embedder');
const { FolderSync } = require('./utils/folder-sync');
const { VecStoreFactory } = require('./vecstore-factory');
const { CONVENTIONS, getConfig } = require('./config/defaults');
const processors = require('./processors');

module.exports = {
  VecStore,
  VecStoreFactory,
  TransformerEmbedder,
  SQLiteStorageAdapter,
  CosineSearchAlgorithm,
  PDFReader,
  PDFEmbedder,
  FolderSync,
  CONVENTIONS,
  getConfig,
  processors
};