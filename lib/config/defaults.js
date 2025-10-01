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
    defaultModel: 'embeddinggemma',
    defaultHost: 'http://localhost:11434'
  },

  sync: {
    defaultExtensions: null,
    recursive: true,
    watchMode: false,
    ignoreDirs: ['node_modules', '.git', 'dist', 'build']
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
  return {
    dbPath: overrides.dbPath !== undefined ? overrides.dbPath : CONVENTIONS.db.defaultPath,
    modelName: overrides.modelName !== undefined ? overrides.modelName : CONVENTIONS.embedder.defaultModel,
    ollamaHost: overrides.ollamaHost !== undefined ? overrides.ollamaHost : CONVENTIONS.embedder.defaultHost,
    extensions: overrides.extensions !== undefined ? overrides.extensions : CONVENTIONS.sync.defaultExtensions,
    recursive: overrides.recursive !== undefined ? overrides.recursive : CONVENTIONS.sync.recursive,
    topK: overrides.topK !== undefined ? overrides.topK : CONVENTIONS.search.defaultTopK,
    storeContent: overrides.storeContent !== undefined ? overrides.storeContent : CONVENTIONS.storage.storeContent,
    ignoreDirs: overrides.ignoreDirs !== undefined ? overrides.ignoreDirs : CONVENTIONS.sync.ignoreDirs,
    ...overrides
  };
}

module.exports = { CONVENTIONS, getConfig };
