'use strict';

const path = require('path');
const os = require('os');

const CONVENTIONS = {
  db: {
    defaultPath: './vecstore.db',
    defaultName: 'vecstore.db',
    dataDir: path.join(process.cwd(), '.vecstore')
  },

  embedder: {
    defaultModel: 'nomic-embed-text',
    defaultHost: 'http://localhost:11434'
  },

  sync: {
    defaultExtensions: null,
    recursive: true,
    watchMode: false,
    ignoreDirs: ['node_modules', '.git', 'dist', 'build'],
    concurrency: 12,
    embedBatchSize: 64,
    embedConcurrency: 8,
    bufferSize: 100,
    flushDelay: 300
  },

  search: {
    defaultTopK: 5,
    minScore: 0.0,
    algorithm: 'cosine'
  },

  storage: {
    storeContent: true,
    storeVectors: true,
    compression: false
  }
};

function getConfig(overrides = {}) {
  const cleanOverrides = {};
  for (const key in overrides) {
    if (overrides[key] !== undefined) {
      cleanOverrides[key] = overrides[key];
    }
  }

  return {
    dbPath: cleanOverrides.dbPath !== undefined ? cleanOverrides.dbPath : CONVENTIONS.db.defaultPath,
    modelName: cleanOverrides.modelName !== undefined ? cleanOverrides.modelName : CONVENTIONS.embedder.defaultModel,
    ollamaHost: cleanOverrides.ollamaHost !== undefined ? cleanOverrides.ollamaHost : CONVENTIONS.embedder.defaultHost,
    extensions: cleanOverrides.extensions !== undefined ? cleanOverrides.extensions : CONVENTIONS.sync.defaultExtensions,
    recursive: cleanOverrides.recursive !== undefined ? cleanOverrides.recursive : CONVENTIONS.sync.recursive,
    topK: cleanOverrides.topK !== undefined ? cleanOverrides.topK : CONVENTIONS.search.defaultTopK,
    storeContent: cleanOverrides.storeContent !== undefined ? cleanOverrides.storeContent : CONVENTIONS.storage.storeContent,
    ignoreDirs: cleanOverrides.ignoreDirs !== undefined ? cleanOverrides.ignoreDirs : CONVENTIONS.sync.ignoreDirs,
    concurrency: cleanOverrides.concurrency !== undefined ? cleanOverrides.concurrency : CONVENTIONS.sync.concurrency,
    ...cleanOverrides
  };
}

module.exports = { CONVENTIONS, getConfig };
