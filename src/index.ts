export { VecStore } from './vecstore.js';
export { TransformerEmbedder } from './embedders/transformer.js';
export { IDBStorageAdapter } from './adapters/idb.js';
export { CosineSearchAlgorithm } from './search/cosine.js';
export { HNSWSearchAlgorithm } from './search/hnsw.js';

// Export types for TypeScript users
export type {
  Embedder,
  Document,
  VecStoreOptions,
  StorageAdapter,
  SearchAlgorithm
} from './types/interfaces.js';
