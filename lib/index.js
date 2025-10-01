'use strict';

const { VecStore } = require('./vecstore');
const { TransformerEmbedder } = require('./embedders/transformer');
const { GemmaEmbedder } = require('./embedders/gemma');
const { SQLiteStorageAdapter } = require('./adapters/sqlite');
const { CosineSearchAlgorithm } = require('./search/cosine');
const { PDFReader } = require('./readers/pdf');
const { PDFEmbedder } = require('./utils/pdf-embedder');
const { FolderSync } = require('./utils/folder-sync');
const { Updater } = require('./utils/updater');
const { VecStoreFactory } = require('./vecstore-factory');
const { CONVENTIONS, getConfig } = require('./config/defaults');
const { WebCrawler } = require('./crawlers/web');
const processors = require('./processors');

module.exports = {
  VecStore,
  VecStoreFactory,
  TransformerEmbedder,
  GemmaEmbedder,
  SQLiteStorageAdapter,
  CosineSearchAlgorithm,
  PDFReader,
  PDFEmbedder,
  FolderSync,
  Updater,
  WebCrawler,
  CONVENTIONS,
  getConfig,
  processors
};