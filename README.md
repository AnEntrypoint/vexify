# vecstore-js

A pluggable Node.js vector database using SQLite with support for Ollama embeddings, multi-format document processing, web crawling, and Google Drive sync.

## Features

- 🚀 **Zero-config vector storage** using SQLite with sqlite-vec
- 🤖 **Ollama embeddings** with auto-installation (nomic-embed-text default)
- 📄 **Multi-format processing**: PDF, DOCX, HTML, JSON, CSV, XLSX
- 🔍 **Semantic search** with cosine similarity
- 💾 **Persistent storage** with better-sqlite3
- 🌐 **Web crawler** with Playwright and text deduplication
- ☁️ **Google Drive sync** with domain-wide delegation support
- 🔁 **Incremental sync** - resume large syncs across multiple calls
- 📦 **CommonJS** compatible for Node.js
- 🔒 **Privacy-first** - all processing happens locally

## Installation

```bash
npm install vecstore-js
```

## Quick Start

### Basic Vector Search

```javascript
const { VecStore, TransformerEmbedder } = require('vecstore-js');

async function main() {
  // Create embedder with local model
  const embedder = await TransformerEmbedder.create('Xenova/bge-small-en-v1.5');

  // Initialize vector store
  const vecStore = new VecStore({
    embedder,
    dbName: './my-vectors.db'
  });

  await vecStore.initialize();

  // Add documents
  await vecStore.addDocument('doc1', 'The quick brown fox jumps over the lazy dog');
  await vecStore.addDocument('doc2', 'A fast auburn fox leaps above a sleepy canine');

  // Query
  const results = await vecStore.query('jumping fox', 5);
  console.log(results);
}
```

### PDF Search with Page Tracking

```javascript
const {
  VecStore,
  TransformerEmbedder,
  PDFEmbedder
} = require('vecstore-js');

async function pdfSearch() {
  const embedder = await TransformerEmbedder.create();
  const vecStore = new VecStore({ embedder });
  await vecStore.initialize();

  // Create PDF embedder
  const pdfEmbedder = new PDFEmbedder(vecStore);

  // Embed entire PDF with page tracking
  const result = await pdfEmbedder.embedPDF('./document.pdf', {
    pdfName: 'my-document.pdf',
    includePageMetadata: true
  });

  console.log(`Embedded ${result.embeddedPages} pages`);

  // Query with page info
  const results = await pdfEmbedder.queryWithPageInfo('search query', 5);

  results.forEach(result => {
    console.log(`Found in: ${result.pdfName}, Page ${result.pageNumber}`);
    console.log(`Score: ${result.score}`);
    console.log(`Text: ${result.text}`);
  });
}
```

### Embed Specific Page Range

```javascript
// Embed only pages 10-20
const result = await pdfEmbedder.embedPDFPageRange(
  './large-document.pdf',
  10,
  20,
  { pdfName: 'large-document.pdf' }
);
```

## CLI Usage

### Quick Start
```bash
# Sync local folder
npx vexify sync ./mydb.db ./documents

# Search
npx vexify query ./mydb.db "your search" 10

# Crawl website
npx vexify crawl https://docs.example.com --max-pages=100

# Google Drive sync
npx vexify gdrive ./mydb.db <folder-id> --service-account ./sa.json --impersonate admin@domain.com
```

### Incremental Google Drive Sync
Process one file at a time, resume on next call:
```bash
npx vexify gdrive ./mydb.db root --service-account ./sa.json --impersonate admin@domain.com --incremental
```

See [docs/QUICK-START.md](./docs/QUICK-START.md) for complete examples.

## Documentation

- **[Quick Start Guide](./docs/QUICK-START.md)** - Get started in 5 minutes
- **[Google Drive Setup](./docs/GDRIVE-SETUP.md)** - Complete auth setup guide
- **[Implementation Summary](./docs/IMPLEMENTATION_SUMMARY.md)** - Architecture details
- **[Performance Audit](./docs/PERFORMANCE_AUDIT.md)** - GPU optimization
- **[Changelog](./docs/CHANGELOG.md)** - Recent updates

## API Reference

### VecStore

```javascript
const vecStore = new VecStore({
  embedder,           // Required: Embedder instance
  store,              // Optional: Custom storage adapter
  search,             // Optional: Custom search algorithm
  dbName,             // Optional: Database path (default: './vecstore.db')
  storeContent        // Optional: Store original content (default: true)
});

await vecStore.initialize();
await vecStore.addDocument(id, content, metadata);
const results = await vecStore.query(query, topK);
```

### PDFReader

```javascript
const { PDFReader } = require('vecstore-js');

const reader = new PDFReader();
await reader.load('./document.pdf');

const pageCount = reader.getPageCount();
const page = await reader.extractPage(1);
const allPages = await reader.extractAllPages();
const markdown = await reader.toMarkdown();
```

### PDFEmbedder

```javascript
const pdfEmbedder = new PDFEmbedder(vecStore);

// Embed full PDF
await pdfEmbedder.embedPDF(pdfPath, options);

// Embed from buffer
await pdfEmbedder.embedPDFFromBuffer(buffer, pdfName, options);

// Embed page range
await pdfEmbedder.embedPDFPageRange(pdfPath, startPage, endPage, options);

// Query with page info
const results = await pdfEmbedder.queryWithPageInfo(query, topK);
```

### TransformerEmbedder

```javascript
// Create embedder with default model
const embedder = await TransformerEmbedder.create();

// Or specify a model
const embedder = await TransformerEmbedder.create('Xenova/bge-small-en-v1.5');

// Embed text
const vector = await embedder.embed('some text');
```

## Document Structure

Documents stored with metadata include:

```javascript
{
  id: 'document.pdf:page:5',
  vector: [0.123, -0.456, ...],
  content: 'Page text content...',
  metadata: {
    source: 'pdf',
    pdfName: 'document.pdf',
    pageNumber: 5,
    totalPages: 100,
    pageMetadata: {
      width: 612,
      height: 792
    }
  },
  score: 0.87  // Added during search
}
```

## Dependencies

- `better-sqlite3` - Fast SQLite database
- `sqlite-vec` - Vector extension for SQLite
- `@xenova/transformers` - Local transformer models
- `unpdf` - PDF text extraction

## License

MIT

## Author

Steve Aldrin