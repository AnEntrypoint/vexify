'use strict';

const path = require('path');
const os = require('os');

const MODEL_REGISTRY = {
  // Ollama models
  'nomic-embed-text': { dimension: 384, provider: 'ollama', tags: ['lightweight'] },
  'embeddinggemma': { dimension: 768, provider: 'ollama', tags: ['default'] },
  'mxbai-embed-large': { dimension: 1024, provider: 'ollama' },
  'all-minilm': { dimension: 384, provider: 'ollama' },
  'snowflake-arctic-embed': { dimension: 1024, provider: 'ollama' },
  'jina-embeddings-v2-base-code': { dimension: 768, provider: 'ollama', tags: ['code'] },
  'unclemusclez/jina-embeddings-v2-base-code': { dimension: 768, provider: 'ollama', tags: ['code'] },

  // vLLM models
  'intfloat/e5-mistral-7b-instruct': { dimension: 4096, provider: 'vllm' },
  'BAAI/bge-large-en-v1.5': { dimension: 1024, provider: 'vllm' },
  'BAAI/bge-base-en-v1.5': { dimension: 768, provider: 'vllm', tags: ['default'] },
  'BAAI/bge-small-en-v1.5': { dimension: 384, provider: 'vllm', tags: ['lightweight'] },
  'thenlper/gte-large': { dimension: 1024, provider: 'vllm' },
  'thenlper/gte-base': { dimension: 768, provider: 'vllm' },
  'sentence-transformers/all-MiniLM-L6-v2': { dimension: 384, provider: 'vllm' },
  'nomic-ai/nomic-embed-text-v1': { dimension: 768, provider: 'vllm' },
  'nomic-ai/nomic-embed-text-v1.5': { dimension: 768, provider: 'vllm' },

  // Transformers.js models
  'Xenova/all-MiniLM-L6-v2': { dimension: 384, provider: 'transformers', tags: ['lightweight'] },
  'Xenova/bge-small-en-v1.5': { dimension: 384, provider: 'transformers', tags: ['lightweight'] },
  'Xenova/bge-base-en-v1.5': { dimension: 768, provider: 'transformers', tags: ['code'] },
  'Xenova/bge-large-en-v1.5': { dimension: 1024, provider: 'transformers' },
  'Xenova/multilingual-e5-small': { dimension: 384, provider: 'transformers' },
  'Xenova/multilingual-e5-base': { dimension: 768, provider: 'transformers' },
  'Xenova/multilingual-e5-large': { dimension: 1024, provider: 'transformers' }
};

const CONVENTIONS = {
  db: {
    defaultPath: './vecstore.db',
    defaultName: 'vecstore.db',
    dataDir: path.join(process.cwd(), '.vecstore')
  },

  embedder: {
    defaultProvider: 'vllm',
    defaultModel: 'BAAI/bge-base-en-v1.5',
    defaultHost: 'http://localhost:8000',
    ollamaDefaultModel: 'embeddinggemma',
    ollamaDefaultHost: 'http://localhost:11434',
    vllmHost: 'http://localhost:8000',
    embedderType: 'auto'
  },

  sync: {
    defaultExtensions: null,
    recursive: true,
    watchMode: false,
    ignoreDirs: ['node_modules', '.git', 'dist', 'build'],
    concurrency: 12,
    embedBatchSize: 1,
    embedConcurrency: 5,
    bufferSize: 100,
    flushDelay: 300
  },

  crawlers: {
    web: {
      maxPages: 100,
      maxDepth: 3,
      timeout: 30000,
      retries: 3,
      userAgent: 'Mozilla/5.0 (compatible; vexify/1.0; +https://github.com/yourusername/vexify)'
    },
    code: {
      supportedLanguages: {
        js: { extensions: ['.js', '.mjs', '.cjs'], parser: 'javascript' },
        ts: { extensions: ['.ts'], parser: 'typescript' },
        py: { extensions: ['.py'], parser: 'python' },
        json: { extensions: ['.json'], parser: 'json' },
        md: { extensions: ['.md', '.markdown'], parser: 'markdown' },
        html: { extensions: ['.html', '.htm'], parser: 'html' },
        css: { extensions: ['.css', '.scss', '.sass', '.less'], parser: 'css' },
        java: { extensions: ['.java'], parser: 'java' },
        go: { extensions: ['.go'], parser: 'go' },
        rs: { extensions: ['.rs'], parser: 'rust' }
      }
    }
  },

  processing: {
    pdf: {
      chunkSize: 2000,
      ocrTimeout: 10000
    },
    text: {
      languageDetection: true,
      minLength: 50
    }
  },

  ollama: {
    pullTimeout: 600000,
    embedTimeout: 300000,
    healthCheckInterval: 30000
  },

  mcp: {
    syncInterval: 60000,
    validationInterval: 30000,
    backgroundIndexingDelay: 1000
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

  const provider = cleanOverrides.embedderProvider !== undefined ? cleanOverrides.embedderProvider : CONVENTIONS.embedder.defaultProvider;
  const defaultModel = provider === 'ollama' ? CONVENTIONS.embedder.ollamaDefaultModel : CONVENTIONS.embedder.defaultModel;
  const defaultHost = provider === 'ollama' ? CONVENTIONS.embedder.ollamaDefaultHost : CONVENTIONS.embedder.defaultHost;

  return {
    dbPath: cleanOverrides.dbPath !== undefined ? cleanOverrides.dbPath : CONVENTIONS.db.defaultPath,
    embedderProvider: provider,
    modelName: cleanOverrides.modelName !== undefined ? cleanOverrides.modelName : defaultModel,
    host: cleanOverrides.host !== undefined ? cleanOverrides.host : defaultHost,
    ollamaHost: cleanOverrides.ollamaHost !== undefined ? cleanOverrides.ollamaHost : CONVENTIONS.embedder.ollamaDefaultHost,
    vllmHost: cleanOverrides.vllmHost !== undefined ? cleanOverrides.vllmHost : CONVENTIONS.embedder.vllmHost,
    embedderType: cleanOverrides.embedderType !== undefined ? cleanOverrides.embedderType : CONVENTIONS.embedder.embedderType,
    extensions: cleanOverrides.extensions !== undefined ? cleanOverrides.extensions : CONVENTIONS.sync.defaultExtensions,
    recursive: cleanOverrides.recursive !== undefined ? cleanOverrides.recursive : CONVENTIONS.sync.recursive,
    topK: cleanOverrides.topK !== undefined ? cleanOverrides.topK : CONVENTIONS.search.defaultTopK,
    storeContent: cleanOverrides.storeContent !== undefined ? cleanOverrides.storeContent : CONVENTIONS.storage.storeContent,
    ignoreDirs: cleanOverrides.ignoreDirs !== undefined ? cleanOverrides.ignoreDirs : CONVENTIONS.sync.ignoreDirs,
    concurrency: cleanOverrides.concurrency !== undefined ? cleanOverrides.concurrency : CONVENTIONS.sync.concurrency,
    embedBatchSize: cleanOverrides.embedBatchSize !== undefined ? cleanOverrides.embedBatchSize : CONVENTIONS.sync.embedBatchSize,
    embedConcurrency: cleanOverrides.embedConcurrency !== undefined ? cleanOverrides.embedConcurrency : CONVENTIONS.sync.embedConcurrency,
    ...cleanOverrides
  };
}

function getModelDimension(modelName = null) {
  const model = modelName || CONVENTIONS.embedder.defaultModel;
  const spec = MODEL_REGISTRY[model];
  if (!spec) {
    throw new Error(`Unknown model: ${model}. Supported models: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
  }
  return spec.dimension;
}

function getSupportedLanguages() {
  const result = {};
  const { js, ts, py, json, md, html, css, java, go, rs } = CONVENTIONS.crawlers.code.supportedLanguages;
  result.javascript = js;
  result.typescript = ts;
  result.python = py;
  result.json = json;
  result.markdown = md;
  result.html = html;
  result.css = css;
  result.java = java;
  result.go = go;
  result.rust = rs;
  return result;
}

function detectOptimalModel(dirPath = process.cwd()) {
  const fs = require('fs');
  const pathModule = require('path');
  const codeRepoIndicators = [
    'package.json', 'tsconfig.json', 'Cargo.toml', 'requirements.txt',
    'pyproject.toml', 'pom.xml', 'build.gradle'
  ];
  const isCodeRepo = codeRepoIndicators.some(indicator =>
    fs.existsSync(pathModule.join(dirPath, indicator))
  );
  return isCodeRepo ? 'jina-embeddings-v2-base-code' : CONVENTIONS.embedder.defaultModel;
}

function validateModelDimension(modelName, actualDimension) {
  const spec = MODEL_REGISTRY[modelName];
  if (!spec) {
    throw new Error(`Unknown model: ${modelName}. Supported models: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
  }
  if (actualDimension !== spec.dimension) {
    throw new Error(
      `Vector dimension mismatch for model ${modelName}: expected ${spec.dimension}, got ${actualDimension}. ` +
      `This indicates a corrupted or incompatible vector database. Delete your .db file and resync.`
    );
  }
}

module.exports = {
  MODEL_REGISTRY,
  CONVENTIONS,
  getConfig,
  getModelDimension,
  getSupportedLanguages,
  detectOptimalModel,
  validateModelDimension
};
