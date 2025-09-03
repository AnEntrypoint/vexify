import {
  Document,
  Embedder,
  VecStoreOptions,
  StorageAdapter,
  SearchAlgorithm,
  IndexedSearchAlgorithm
} from './types/interfaces.js';

import { IDBStorageAdapter } from './adapters/idb.js'; // fallback if no adapter provided
import { CosineSearchAlgorithm } from './search/cosine.js';

export class VecStore {
  private embedder: Embedder;
  private store: StorageAdapter;
  private search: SearchAlgorithm;
  private storeContent: boolean;

  constructor(options: VecStoreOptions) {
    this.embedder = options.embedder;
    this.store = options.store || new IDBStorageAdapter(options.dbName || 'vecstore');
    this.search = options.search || new CosineSearchAlgorithm();
    this.storeContent = options.storeContent ?? true; // Default to true for backward compatibility
  }

  async addDocument(id: string, content: unknown, metadata?: Record<string, any>) {
    // For now, assume content is a string for embedding
    // Future: embedders can handle different content types
    const vector = await this.embedder.embed(content as string);
    
    const doc: Document = {
      id,
      vector,
      ...(this.storeContent && { content }), // Conditionally include content
      metadata
    };
    
    await this.store.put(doc);
    
    // If search algorithm supports indexing, add to index immediately
    if (this.isIndexedSearch(this.search)) {
      await this.search.addDocument(doc);
    }
  }

  async query(queryContent: unknown, topK: number = 5): Promise<Document[]> {
    // For now, assume queryContent is a string for embedding
    const queryVec = await this.embedder.embed(queryContent as string);
    
    // Use fast path if available (indexed search)
    if (this.isIndexedSearch(this.search)) {
      return this.search.searchIndex(queryVec, topK);
    }
    
    // Fallback to slow path (load all documents)
    const allDocs = await this.store.getAll();
    return this.search.search(queryVec, allDocs, topK);
  }

  // Type guard to check if search algorithm supports indexing
  private isIndexedSearch(search: SearchAlgorithm): search is IndexedSearchAlgorithm {
    return 'addDocument' in search && 'searchIndex' in search && 'initialize' in search;
  }

  // Initialize the search algorithm if it supports indexing
  async initialize() {
    if (this.isIndexedSearch(this.search)) {
      await this.search.initialize();
      
      // Load existing documents into the index
      const existingDocs = await this.store.getAll();
      for (const doc of existingDocs) {
        await this.search.addDocument(doc);
      }
    }
  }
}
