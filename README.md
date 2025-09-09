# VecStore-js

**A simple, fast, and pluggable vector storage for the browser.**

VecStore-js brings the power of local, privacy-preserving semantic search to your client-side applications. It uses local embeddings and stores data directly in the user's browser via IndexedDB, making it perfect for offline-first AI features, browser extensions, and web apps where data privacy is critical.

[![NPM](https://img.shields.io/npm/v/vecstore-js)](https://www.npmjs.com/package/vecstore-js)
[![License](https://img.shields.io/npm/l/vecstore-js)](https://github.com/your-username/your-repo-name/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/written%20in-TypeScript-blue)](https://www.typescriptlang.org/)

## Features

-   🧠 **Local Semantic Search**: No server calls needed. All processing happens in the browser.
-   🚀 **High Performance**: Powered by HNSW (Hierarchical Navigable Small World) for fast, approximate nearest-neighbor search, implemented in WebAssembly.
-   🔌 **Pluggable Components**: Easily switch between search algorithms (HNSW, Cosine Similarity) and embedding models.
-   🔒 **Privacy-First**: User data never leaves the browser.
-    offline **Offline-First**: Caches models and data for use without an internet connection.
-   📦 **Lightweight**: Small footprint, designed for the client-side.

## Installation

```bash
npm install vecstore-js
```

## Quick Start

This example shows how to set up a vector store, add documents, and perform a semantic search.

```javascript
import { VecStore, TransformerEmbedder, HNSWSearchAlgorithm } from 'vecstore-js';

// 1. Create an embedder to convert text to vectors
// This will download a model on first run and cache it in IndexedDB.
const embedder = await TransformerEmbedder.create();

// 2. Create the vector store with the HNSW algorithm for performance
const store = new VecStore({ 
  embedder, 
  search: new HNSWSearchAlgorithm()
});

// 3. Initialize the store (required for indexed search algorithms like HNSW)
await store.initialize();

// 4. Add documents. They are indexed immediately.
await store.addDocument('doc1', 'The Eiffel Tower is a famous landmark in Paris.');
await store.addDocument('doc2', 'Pasta is a staple of Italian cuisine.');
await store.addDocument('doc3', 'Machine learning is a subset of artificial intelligence.');

// 5. Perform a semantic search
const query = 'What are some popular foods in Europe?';
const results = await store.query(query, 2);

console.log(results);
/*
[
  {
    id: 'doc2',
    vector: [ ... ],
    content: 'Pasta is a staple of Italian cuisine.',
    score: 0.891
  },
  {
    id: 'doc1',
    vector: [ ... ],
    content: 'The Eiffel Tower is a famous landmark in Paris.',
    score: 0.763
  }
]
*/
```

## Choosing a Search Algorithm

VecStore.js has a pluggable architecture. You can choose the best search algorithm for your needs.

### HNSW (Default & Recommended)

For most applications, HNSW is the best choice. It's much faster than exact search, especially with thousands of documents.

```javascript
import { HNSWSearchAlgorithm } from 'vecstore-js';

const store = new VecStore({ 
  embedder, 
  search: new HNSWSearchAlgorithm({
    // Optional: Tune HNSW parameters for your use case
    maxElements: 50000, // Max documents to store
    efSearch: 100,      // Search quality/speed tradeoff
  })
});
await store.initialize(); // Don't forget to initialize!
```

### Cosine Similarity (Simple & Exact)

For small datasets or when you need exact (but slower) results, you can use simple cosine similarity.

```javascript
import { CosineSearchAlgorithm } from 'vecstore-js';

const store = new VecStore({ 
  embedder, 
  search: new CosineSearchAlgorithm()
});
await store.initialize(); // Don't forget to initialize!
```

## API Reference

### `VecStore`

#### `new VecStore(options)`

-   `options.embedder: Embedder` **(required)** - An instance of an embedder.
-   `options.search?: SearchAlgorithm` - The search algorithm to use. Defaults to `CosineSearchAlgorithm`.
-   `options.store?: StorageAdapter` - A custom storage adapter. Defaults to `IDBStorageAdapter`.
-   `options.dbName?: string` - The name for the IndexedDB database. Defaults to `'vecstore'`.
-   `options.storeContent?: boolean` - Whether to store the original document content. Defaults to `true`.

#### `store.initialize()`

Initializes the store. **Required** when using an `IndexedSearchAlgorithm` like HNSW. It loads existing documents from storage into the search index.

#### `store.addDocument(id, content, metadata?)`

-   `id: string` - A unique ID for the document.
-   `content: string` - The text content to be embedded and indexed.
-   `metadata?: Record<string, any>` - Optional object for storing extra data.

#### `store.query(query, topK?)`

-   `query: string` - The text to search for.
-   `topK?: number` - The number of similar documents to return. Defaults to `5`.

## License

MIT
