# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

**vexify** is a portable vector database with semantic search, built on SQLite + embedding models (vLLM, Ollama, or Transformers.js). It processes multiple document formats (PDF, HTML, DOCX, JSON, CSV, XLSX), crawls websites, syncs Google Drive folders, and provides an MCP server for Claude Code integration.

**Core Philosophy**: Zero-config, local-first, CommonJS-compatible. No external APIs. Auto-detects vLLM (GPU-optimized) → Ollama (fallback) → transformers.js (in-process ONNX, no server required) → auto-installs Ollama.

## Architecture

### Core Components

**Storage** (`lib/adapters/sqlite.js`): SQLite + sqlite-vec extension, Float32 embeddings, JSON metadata

**Embedders** (`lib/embedders/`):
- `vllm.js`: OpenAI-compatible API, port 8000 (GPU-optimized, checked first)
- `ollama.js`: Ollama server, port 11434 (auto-installed fallback)
- `transformers.js`: In-process ONNX via @huggingface/transformers (no external server, ultimate fallback)
- Auto-detection order: vLLM → Ollama → transformers.js → auto-setup Ollama
- Default models: nomic-embed-text (Ollama/vLLM, 384-dim), Xenova/bge-base-en-v1.5 (transformers.js, 768-dim)

**Processors** (`lib/processors/`): BaseProcessor + format-specific (html, pdf, docx, excel, csv, json, txt), SHA-256 dedup

**Crawlers** (`lib/crawlers/`): web (Playwright depth/page limits), gdrive (incremental), code (semantic indexing)

**Search** (`lib/search/`): sqlite-vec (fast) + cosine (fallback)

**Utils**: embedding-queue (batching/retry), folder-sync (monitoring), ignore-manager (gitignore), ollama-setup (auto-install), pdf-embedder

**MCP** (`lib/mcp/server.js`): Model Context Protocol search tool, auto-syncs before queries, foreground only

**Module Structure**:
- Entry: `lib/index.js` (public API)
- CLI: `lib/bin/cli.js` (commands)
- Factories: VecStoreFactory (config/setup)
- Config: `lib/config/defaults.js` (centralized values)

### Data Flow

```
Input → Crawlers → Processors → Dedup → Embedding Queue → SQLite → Search
```

## Quick Start & Commands

### Development

```bash
# Local testing
npm link
vexify sync ./test.db ./documents
vexify query ./test.db "search term" 5
vexify crawl https://example.com --max-pages 50
vexify mcp --directory . --db-path ./.vexify.db

# Force specific embedder
vexify sync ./test.db ./documents --embedder-type vllm          # or ollama, transformers
vexify sync ./test.db ./documents --embedder-type transformers  # in-process ONNX (no server)

# vLLM (faster GPU inference)
vllm serve nomic-ai/nomic-embed-text-v1.5 --port 8000    # auto-detected first

# transformers.js (in-process, no server)
npm install @huggingface/transformers  # optional dependency, auto-detected third

# Debug
NODE_DEBUG=vexify vexify sync ./test.db ./documents

# Cleanup
npm unlink
```

### Publishing

```bash
# Update package.json version (major.minor.patch)
# Commit: "chore: bump version to X.Y.Z"
npm publish
# Use "fix:" prefix for bug fixes, "chore:" for version bumps
```

### Code Maintenance

```bash
find lib -name "*.js" -exec wc -l {} \; | sort -rn | head -10  # Find large files (>200 lines)
wc -l lib/**/*.js                                               # Check line counts
```

## Critical Constraints

**File Size**: Keep files <200 lines. Refactor candidates: `lib/utils/ignore-manager.js`, `lib/crawlers/web.js`

**Path Handling**: ALWAYS use `path.resolve()`, never string concatenation (CLI vs programmatic usage differs)

**Database Writes**: SQLite = one writer at a time. Multiple processes → deadlock. Each DB path exclusive to one process.

**Vector Dimensions**: Embeddings must match model (384 for nomic-embed-text, 768 for Xenova/bge-base-en-v1.5). Changes require migration in `lib/adapters/sqlite.js`. Don't mix embedders with different dimensions on same database.

**Memory Limits**: Playwright web crawler can OOM on large sites. Increase depth/page limits cautiously.

**Offline Environments**: Ollama/vLLM auto-pull models (2GB+). Pre-install: `ollama pull nomic-embed-text`. Alternatively, use transformers.js for in-process embeddings (no server, downloads models on first use).

**WSL Detection**: `lib/embedders/ollama.js:26` has 2000ms timeout to avoid blocking MCP startup

**Google Drive Quota**: Use `--incremental` flag for large folders (processes one file/call, stateless)

**Dedup**: SHA-256 content hashing in `lib/processors/dedup.js`. Same hash = duplicate regardless of source.

**Search Fallback**: Missing sqlite-vec → cosine similarity (10-100x slower, may timeout on large datasets)

**File Encoding**: UTF-8 assumed. Non-UTF-8 or PDFs with embedded fonts may fail extraction.

**Hardcoded Values**: Configuration in `lib/config/defaults.js`. Never inline batch sizes, retry counts, paths.

**Duplicate Logic**: `docx.js` and `excel.js` share patterns. Sync changes or extract shared code.

**Comments**: Replace with explicit names. If name is unclear, refactor, don't comment.

## Implementation Guide

### HTML Processing (jsdom 27.0.1 ES Module Issue)

`lib/processors/html.js` has two-stage fallback:
```javascript
try {
  const dom = new JSDOM(htmlContent, { url: options.url || 'http://localhost' });
  const article = new Readability(dom.window.document).parse();
  // Use article.content
} catch {
  const markdown = NodeHtmlMarkdown.translate(htmlContent);  // Fallback
}
```
Ensures 100% HTML processing success.

### SQLite Schema

```
Documents table:
- id (TEXT): Unique doc ID
- content (TEXT): Full text (if storeContent=true)
- embedding (BLOB): Float32 vector
- metadata (JSON): {source, title, format, hash, ...}
```

### Adding New Format Processor

1. Create `lib/processors/format.js` extending BaseProcessor
2. Implement `process(filePath, options)` method
3. Register in `lib/processors/index.js`
4. Test with real problematic files (not mocks)

### Embedding Queue (`lib/utils/embedding-queue.js`)

- Batches documents for efficiency
- Groups small docs for semantic cohesion
- Retries failed embeddings
- Tracks progress
- Integrates with folder-sync for real-time updates

### Ignore Patterns (`lib/utils/ignore-manager.js`)

- Loads .gitignore, .dockerignore, custom patterns
- Used by all crawlers to skip irrelevant files
- Critical for web crawlers (avoid duplicate pages)

### Transformers.js Models (`lib/embedders/transformers.js`)

Supported in-process ONNX models:
- `Xenova/all-MiniLM-L6-v2`: 384-dim (smallest, fastest)
- `Xenova/bge-small-en-v1.5`: 384-dim
- `Xenova/bge-base-en-v1.5`: 768-dim (default, balanced)
- `Xenova/bge-large-en-v1.5`: 1024-dim (largest, most accurate)
- `Xenova/multilingual-e5-*`: Multilingual support (384/768/1024-dim)

Singleton pipeline reused across embeddings for memory efficiency.

## Troubleshooting

### Embedding Failures
- Check logs in `lib/utils/embedding-queue.js` (content hash)
- Verify server: `curl http://localhost:11434/api/tags` (Ollama) or `curl http://localhost:8000/health` (vLLM)
- transformers.js: check `npm list @huggingface/transformers` (optional dependency)
- Check model: `ollama list` or wait for auto-pull
- Large files: increase batch size

### Processor Issues
- Add `console.error()` in `lib/processors/format.js`
- Check dedup: query DB for SHA-256 hash in metadata
- Verify `path.resolve()` usage (not concatenation)
- Test with actual problematic files

### Crawler Stuck/Slow
- **Web**: Check depth/page limits in `lib/crawlers/web.js`
- **Google Drive**: Use `--incremental` flag
- **Code**: Verify `.gitignore` respected in `lib/utils/ignore-manager.js`
- Profile: `console.time()` around slow sections

### Search Issues
- Check sqlite-vec loaded: `lib/adapters/sqlite.js` (fallback warning)
- Verify dimensions match embedder: 384 (nomic-embed-text), 768 (Xenova/bge-base-en-v1.5)
- Validate metadata JSON storage
- Cosine fallback significantly slower

### Database Corruption
- Check schema: `id`, `content`, `embedding`, `metadata`
- Verify no concurrent writes (one process per DB)
- Solution: delete `.db` and resync

### Performance Optimization
- Embedding queue batching: `lib/utils/embedding-queue.js`
- Profile: `console.time()` around slow operations
- Search: ensure sqlite-vec loaded (not cosine fallback)

## Testing

### Automated Tests (88 passing)
```bash
node ../eval.js  # From vexify root
# Coverage: storage, embeddings, processors, crawlers, search, MCP, CLI, integration
# See ../EVALS.md for details
```

### Manual Testing
```bash
# Format processors (use real problematic files)
npx vexify sync ./test.db ./test-documents
npx vexify query ./test.db "search term" 5

# Web crawler
npx vexify crawl https://docs.example.com --max-pages 10 --max-depth 2

# Code crawler
npx vexify code ./test.db ./lib

# Folder sync
npx vexify sync ./test.db ./documents  # Add/modify files to test monitoring

# MCP server
# Terminal 1:
npx vexify mcp --directory ./test --db-path ./.vexify.db
# Terminal 2: Test via Claude Code
```

Always use real documents (PDFs, DOCX, CSV from actual sources), not synthetic test data.

## MCP Integration

Claude Code configuration (`~/.claude/claude_desktop.json`):
```json
{
  "mcpServers": {
    "vexify": {
      "command": "npx",
      "args": ["vexify@latest", "mcp", "--directory", ".", "--db-path", "./.vexify.db"]
    }
  }
}
```

**Behavior**:
1. Auto-syncs directory before each search
2. Respects .gitignore
3. Returns file paths + line numbers
4. Supports natural language code queries

## Dependencies & Deployment

**Core Dependencies** (locked in package.json):
- `better-sqlite3`: SQLite binding
- `sqlite-vec`: Vector similarity
- `jsdom` + `@mozilla/readability` + `node-html-markdown`: HTML processing
- `playwright`: Web crawling
- `pdfjs-dist`: PDF extraction
- `exceljs` + `officeparser`: Office docs

All in `dependencies` (not `devDependencies`).

**Published on npm as `vexify`.**

## Performance Notes

- **Embedding Speed**: vLLM (fastest, GPU) > Ollama (moderate, GPU optional) > transformers.js (slowest, CPU-only ONNX)
- **Zero-Config**: transformers.js requires no server setup, ideal for constrained environments
- **Storage**: SQLite handles millions of vectors efficiently
- **Search**: sqlite-vec 10-100x faster than cosine
- **Crawling**: Playwright memory-intensive, limit depth/pages

## Recent Changes

- **v0.19.1**: TransformersEmbedder singleton pipeline reuse optimization
- **v0.19.0**: In-process ONNX embeddings via transformers.js (no external server required, ultimate fallback)
- **v0.18.0**: vLLM support (OpenAI-compatible API, auto-detection, faster GPU inference)
- **v0.17.0**: MODEL_REGISTRY, FileMonitor, IndexingState, metadata validation
- **v0.16.28**: Centralized config values
- **v0.16.27**: HTML markdown fallback for jsdom errors

See `git log` for full history.
