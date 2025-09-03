import { Document, IndexedSearchAlgorithm } from '../types/interfaces.js';
import { loadHnswlib } from 'hnswlib-wasm';

interface HNSWLibConfig {
  space: 'l2' | 'ip' | 'cosine';  // Distance metric
  efConstruction: number;         // Build quality parameter  
  maxConnections: number;         // M parameter
  maxElements: number;           // Maximum number of elements
  efSearch: number;              // Search quality parameter
  randomSeed: number;            // Random seed for reproducibility
}

export class HNSWSearchAlgorithm implements IndexedSearchAlgorithm {
  private config: HNSWLibConfig;
  private lib: any;
  private index: any;
  private isInitialized = false;
  private documents = new Map<string, Document>(); // Store documents by ID
  private idToLabel = new Map<string, number>(); // Map document ID to HNSW label
  private labelToId = new Map<number, string>(); // Map HNSW label to document ID
  private dimension: number | null = null;

  constructor(config: Partial<HNSWLibConfig> = {}) {
    this.config = {
      space: config.space ?? 'cosine',
      efConstruction: config.efConstruction ?? 200,
      maxConnections: config.maxConnections ?? 16,
      maxElements: config.maxElements ?? 10000,
      efSearch: config.efSearch ?? 32,
      randomSeed: config.randomSeed ?? 100
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;


    this.lib = await loadHnswlib();
    this.isInitialized = true;
  }

  async addDocument(doc: Document): Promise<void> {
    await this.initialize();

    // Set dimension from first document
    if (this.dimension === null) {
      this.dimension = doc.vector.length;
      this.createIndex();
    }

    // Check dimension consistency
    if (doc.vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${doc.vector.length}`);
    }

    // Skip if document already exists (update not supported yet)
    if (this.documents.has(doc.id)) {
      console.warn(`Document ${doc.id} already exists, skipping`);
      return;
    }

    // Store document
    this.documents.set(doc.id, doc);

    try {
  
      const vector = new Float32Array(doc.vector);
      const labels = this.index.addItems([vector], true);
      const label = labels[0];

      // Store mappings
      this.idToLabel.set(doc.id, label);
      this.labelToId.set(label, doc.id);


    } catch (error) {
   
      this.documents.delete(doc.id); 
      throw new Error (`Failed to add document to HNSW index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchIndex(queryVector: number[], topK: number): Promise<(Document & { score: number })[]> {
    if (!this.isInitialized || !this.index) {
      throw new Error('HNSW index not initialized');
    }

    if (this.documents.size === 0) {
      return [];
    }

    if (queryVector.length !== this.dimension) {
      throw new Error(`Query vector dimension mismatch: expected ${this.dimension}, got ${queryVector.length}`);
    }

    // Create label filter to only return documents that still exist
    const labelFilter = (label: number) => {
      return this.labelToId.has(label);
    };

    // Search using HNSW with label filter
    const result = this.index.searchKnn(queryVector, Math.min(topK, this.documents.size), labelFilter);

    const results: (Document & { score: number })[] = [];

    if (result.neighbors && result.distances) {
      for (let i = 0; i < result.neighbors.length; i++) {
        const label = result.neighbors[i];
        const documentId = this.labelToId.get(label);

        if (!documentId) continue;

        const document = this.documents.get(documentId);
        if (!document) continue;

        const distance = result.distances[i];
        // Convert distance to similarity score based on metric
        let score: number;

        switch (this.config.space) {
          case 'cosine':
            score = 1 - distance; // Cosine distance to similarity
            break;
          case 'ip': // Inner product
            score = distance; // Higher is better for IP
            break;
          case 'l2':
          default:
            score = 1 / (1 + distance); // L2 distance to similarity
            break;
        }

        results.push({
          ...document,
          score
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }


  async search(queryVector: number[], documents: Document[], topK: number): Promise<(Document & { score: number })[]> {
    // For indexed search, we ignore the documents parameter and use our internal index
    return this.searchIndex(queryVector, topK);
  }

  private createIndex(): void {
    if (!this.lib || this.dimension === null) {
      throw new Error('Cannot create index: library not loaded or dimension not set');
    }

//Added empty string to the end of the arguments to fix the error from the hnswlib-wasm library
    this.index = new this.lib.HierarchicalNSW(
      this.config.space,
      this.dimension
      , ""
    );

   
    this.index.initIndex(
      this.config.maxElements,     // maxElements (not dimension!)
      this.config.maxConnections,  // M parameter
      this.config.efConstruction,  // efConstruction
      this.config.randomSeed       // randomSeed
    );

    // Set search parameter (can be changed later)
    this.index.setEfSearch(this.config.efSearch);


  }

  // Utility methods for inspection
  getDocumentCount(): number {
    return this.documents.size;
  }

  hasDocument(id: string): boolean {
    return this.documents.has(id);
  }

  // Update search parameters
  setEfSearch(efSearch: number): void {
    if (this.index) {
      this.index.setEfSearch(efSearch);
      this.config.efSearch = efSearch;
    }
  }
}