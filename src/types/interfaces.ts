// === Core Document structure ===
export type Document = {
    id: string;
    vector: number[];
    content?: unknown;              // Optional: stores original content (text, image blob, etc.)
    metadata?: Record<string, any>;
  };
  
  // === Embedder Interface ===
  export interface Embedder {
    embed(text: string): Promise<number[]>;
  }
  
  // === Storage Adapter Interface ===
  // This is implemented by IDB, Memory, OPFS, etc.
  export interface StorageAdapter {
    put(doc: Document): Promise<void>;
    getAll(): Promise<Document[]>;
  }
  
  // === Search Algorithm Interface ===
  // This is implemented by Cosine, HNSW, etc.
  export interface SearchAlgorithm {
    search(queryVector: number[], documents: Document[], topK: number): Promise<(Document & { score: number })[]>;
  }

  // === Indexed Search Algorithm Interface ===
  // For algorithms that can maintain their own index (HNSW, LSH, etc.)
  export interface IndexedSearchAlgorithm extends SearchAlgorithm {
    // Index management methods
    addDocument(doc: Document): Promise<void>;
  
    // Direct search using internal index (faster)
    searchIndex(queryVector: number[], topK: number): Promise<(Document & { score: number })[]>;
    
    // Initialize index if needed
    initialize(): Promise<void>;
  }
  
  // === Options passed to VecStore constructor ===
  export interface VecStoreOptions {
    embedder: Embedder;
    dbName?: string;               // Used only if default storage is created
    store?: StorageAdapter;        // Optional: user can pass in a custom store
    search?: SearchAlgorithm;      // Optional: user can pass in a custom search algorithm
    storeContent?: boolean;        // Optional: whether to store original content (default: true)
  }
  