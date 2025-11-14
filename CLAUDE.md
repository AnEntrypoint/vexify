# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vexify** is a portable vector database with semantic search, built on SQLite + embedding models (vLLM, Ollama, or Transformers.js). It processes multiple document formats (PDF, HTML, DOCX, JSON, CSV, XLSX), crawls websites, syncs Google Drive folders, and provides an MCP server for Claude Code integration.

**Key characteristic**: Zero-config, local-first, CommonJS-compatible. Supports vLLM (default), Ollama, and in-process ONNX embeddings via Transformers.js. No external APIs required.

## Architecture

### Core Layers

**Storage Layer** (`lib/adapters/sqlite.js`):
- SQLite with sqlite-vec extension for vector operations
- Embeddings stored as float arrays
- Document metadata with source tracking

**Embedding Layer** (`lib/embedders/`):
- `vllm.js`: vLLM OpenAI-compatible API (default, port 8000)
- `ollama.js`: Ollama server (fallback, auto-installed, port 11434)
- `transformers.js`: In-process ONNX embeddings (no server required)
- Default provider: vLLM (BAAI/bge-base-en-v1.5, 768-dim)
- Auto mode: checks vLLM → Ollama → Transformers.js → auto-setup Ollama
- Handles retries, connection detection, and model pulling

**Processing Pipeline** (`lib/processors/`):
- `base.js`: BaseProcessor abstract class
- Format-specific processors: html.js, pdf.js, docx.js, excel.js, csv.js, json.js, txt.js
- `dedup.js`: Content deduplication via SHA-256 hashing
- Processors extract text → metadata → document chunks

**Crawlers** (`lib/crawlers/`):
- `web.js`: Playwright-based web crawler with depth/page limits
- `gdrive.js`: Google Drive sync with incremental support
- `code.js`: Source code indexing for semantic code search

**Search** (`lib/search/`):
- `cosine.js`: Pure cosine similarity (fallback)
- `sqlite-vec.js`: Fast vector similarity via sqlite-vec extension

**Utils**:
- `embedding-queue.js`: Batch embedding with retry logic
- `folder-sync.js`: Monitors local folders for changes
- `ignore-manager.js`: Respects .gitignore, .dockerignore, custom patterns
- `ollama-setup.js`: Auto-downloads/starts Ollama
- `pdf-embedder.js`: PDF-specific embedding with page tracking

**MCP Server** (`lib/mcp/server.js`):
- Implements Model Context Protocol for Claude Code
- `search` tool: Semantic search over synced content
- Auto-syncs before each search
- Runs in foreground (not daemon)

### Data Flow

```
Input Files/URLs
    ↓
Crawlers (web/gdrive/code) → Downloaded files
    ↓
Processors (format-specific) → Text extraction
    ↓
Dedup (content hashing) → Unique chunks
    ↓
Embedding Queue → Ollama embeddings
    ↓
SQLiteStorageAdapter → Vector + metadata stored
    ↓
Search (cosine/sqlite-vec) → Query results
```

## Development Commands

### Using vLLM (Default, Recommended for GPU)

```bash
# Start vLLM server (requires GPU)
python -m vllm.entrypoints.openai.api_server --model BAAI/bge-base-en-v1.5 --port 8000

# Vexify uses vLLM by default
vexify sync ./test.db ./documents
vexify query ./test.db "search term" 5
```

### Using Ollama (Alternative)

```bash
# Start Ollama server
ollama serve

# Pull model
ollama pull embeddinggemma

# Use with --provider flag
vexify sync ./test.db ./documents --provider ollama
vexify query ./test.db "search term" 5 --provider ollama
```

### Using Transformers.js (No Server Required)

```bash
# Install optional dependency
npm install @huggingface/transformers

# Use with --provider flag
vexify sync ./test.db ./documents --provider transformers
```

vLLM provides faster inference and better GPU utilization. The default is vLLM, but you can use `--provider` to switch.

### Local Development

```bash
# Link package locally for testing
npm link

# Unlink when done
npm unlink

# Test CLI with local changes
vexify sync ./test.db ./documents
vexify query ./test.db "search term" 5
vexify crawl https://example.com --max-pages 50

# Test MCP server (will use vLLM if available)
vexify mcp --directory . --db-path ./.vexify.db

# Force specific embedder type
vexify sync ./test.db ./documents --embedder-type vllm
vexify sync ./test.db ./documents --embedder-type ollama
```

### Publishing

```bash
# Bump version in package.json (major.minor.patch)
# Commit: "chore: bump version to X.Y.Z"
# Then publish:
npm publish
```

### Maintenance & Debugging

```bash
# Find large/complex functions needing refactoring
find lib -name "*.js" -exec wc -l {} \; | sort -rn | head -10

# Check file line counts during development
wc -l lib/**/*.js

# Profile slow operations
NODE_DEBUG=vexify vexify sync ./test.db ./documents
```

## Technical Caveats

**File Size**: Files >200 lines become difficult to reason about. `lib/utils/ignore-manager.js` and `lib/crawlers/web.js` are candidates for extraction.

**Duplicate Logic**: `docx.js` and `excel.js` share processing patterns - changes to one should be synced to the other or extracted.

**Hardcoded Values**: Configuration lives in `lib/config/defaults.js` - avoid inline values like batch sizes, retry counts, or path patterns.

**Path Handling**: Use `path.resolve()` not string concatenation. Relative paths vary across CLI vs programmatic usage.

**Module Structure**:
- Entry: `lib/index.js` (exports public API)
- CLI: `lib/bin/cli.js` (command handlers)
- Factories: Classes like `VecStoreFactory` handle configuration/setup
- Adapters: Storage/search implementations (pluggable)
- Processors: Format-specific document processing
- Crawlers: External data sources (web, Google Drive, code)
- Utils: Shared utilities (embedding queue, folder sync, ignore patterns)

## Key Implementation Notes

### HTML Processing (Recent Fix)

**Issue**: jsdom 27.0.1 has ES Module compatibility issue with parse5 (CJS requiring ESM).

**Solution** (`lib/processors/html.js`): Try Readability first, fall back to NodeHtmlMarkdown if jsdom fails:
```javascript
try {
  const dom = new JSDOM(htmlContent, { url: options.url || 'http://localhost' });
  const article = new Readability(dom.window.document).parse();
  // Use article.content if successful
} catch {
  // Fall back to markdown extraction
  const markdown = NodeHtmlMarkdown.translate(htmlContent);
}
```

This ensures 100% of HTML files get processed (either via Readability or markdown fallback), not blocked by jsdom errors.

### Embedding Queue

`lib/utils/embedding-queue.js` batches documents for efficient Ollama calls:
- Groups small documents for semantic cohesion
- Retries failed embeddings
- Tracks progress
- Integrates with folder-sync for real-time updates

### Ignore Patterns

`lib/utils/ignore-manager.js` implements universal ignore rules:
- Loads .gitignore, .dockerignore, custom patterns
- Used by all crawlers to skip irrelevant files
- Critical for web crawlers (avoid crawling duplicate pages)

### SQLite Schema

Documents table:
- `id` (TEXT): Unique doc ID
- `content` (TEXT): Full text (if storeContent=true)
- `embedding` (BLOB): Float32 vector
- `metadata` (JSON): Source, title, format, hash, etc.
- Vector similarity searches via sqlite-vec extension

### Google Drive Incremental Sync

`lib/crawlers/gdrive.js` with `--incremental` flag:
- Processes ONE file per call (stateless)
- Returns next token for resuming
- Enables processing massive shared drives without memory issues
- Used by SAR tax acts crawler for stability

## Testing & Validation

**Comprehensive Eval System** - Automated validation with 88 passing tests:
- Run `node ../eval.js` from vexify root to validate all components
- Tests cover: storage, embeddings, processors, crawlers, search, MCP, CLI, integration
- All tests pass without external services or test data
- See ../EVALS.md for detailed test coverage

**Manual Testing** - For validation and troubleshooting:
- Use real documents (PDFs, DOCX, CSV from actual sources, not mock data)
- Test all format processors with problematic files they commonly fail on
- Verify locally with `.vexify.db` in project root
- Use `npm link` to test CLI changes in isolation

**Format Processor Testing**:
```bash
# Test specific processor with a real file
npx vexify sync ./test.db ./test-documents  # Contains a problematic PDF
# Verify embedding and search work
npx vexify query ./test.db "search term" 5
```

**Crawler Testing**:
```bash
# Web crawler depth/limits
npx vexify crawl https://docs.example.com --max-pages 10 --max-depth 2

# Code crawler on this repo
npx vexify code ./test.db ./lib

# Folder sync with monitoring
npx vexify sync ./test.db ./documents
# Add/modify files in ./documents and verify they're picked up
```

**MCP Server Testing**:
```bash
# Terminal 1: Start MCP server
npx vexify mcp --directory ./test --db-path ./.vexify.db

# Terminal 2: Test search via Claude Code or direct invocation
```

## Debugging Patterns

### Embedding Failures
- Check `lib/utils/embedding-queue.js` - logs failed documents with content hash
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check model exists: `ollama list` or wait for auto-pull
- For large files: Increase batch size in `embedding-queue.js`

### Processor Issues
- Add `console.error()` statements in `lib/processors/format.js` to trace execution
- Check dedup: search database for duplicate content via SHA-256 hash in metadata
- Verify file path handling - use `path.resolve()` not path concatenation
- Test with actual problematic files, not synthetic ones

### Crawler Stuck/Slow
- **Web crawler**: Check `lib/crawlers/web.js` depth limit and page limit
- **Google Drive**: Use `--incremental` flag for large folders to process one file per call
- **Code crawler**: Verify `.gitignore` respected in `lib/utils/ignore-manager.js`
- Profile with `console.time()` around slow sections

### Search Issues
- Verify `sqlite-vec` extension loaded: `lib/adapters/sqlite.js` fallback to cosine
- Check vector dimensions match embedder output (default 384 for nomic-embed-text)
- Ensure metadata stored correctly in JSON for filtering
- Cosine fallback significantly slower - check sqlite-vec availability

### Database Corruption
- Check SQLite schema in `lib/adapters/sqlite.js` - `id`, `content`, `embedding`, `metadata`
- Verify no concurrent writes to same database from multiple processes
- Delete corrupted `.db` file and resync

## Maintenance

### Common Tasks

**Add support for new document format**:
1. Create `lib/processors/format.js` extending `BaseProcessor`
2. Implement `process(filePath, options)` method
3. Register in `lib/processors/index.js`
4. Test with real documents of that format

**Optimize slow operations**:
- Check embedding queue batching (embedding-queue.js)
- Profile with `console.time()` around slow sections
- Consider sqlite-vec vs cosine for search performance

**Fix processor bugs**:
- Isolate in `lib/processors/` file
- Test with problematic file
- Ensure dedup catches duplicates (SHA-256 content hash)

## Recent Changes

- **v0.18.0**: vLLM support added
  - VLLMEmbedder: OpenAI-compatible API client for vLLM servers
  - Auto-detection: Prefers vLLM (port 8000) → Ollama (port 11434) → auto-setup Ollama
  - Config: embedderType ('auto'|'vllm'|'ollama'), vllmHost option
  - Benefits: vLLM offers faster inference with GPU optimization
- **v0.17.0**: Architecture Phase 1 complete
  - MODEL_REGISTRY: Centralized model dimensions with validation
  - FileMonitor + IndexingState: MCPServer state extraction
  - Metadata schema validation: Type-safe metadata
- **v0.16.28**: Centralized all config values
- **v0.16.27**: Fixed HTML text extraction with markdown fallback
- **v0.16.26**: Auto-sync in MCP silent mode
- **v0.16.25**: Optimized MCP server startup

See git log for full history.

## MCP Integration for Developers

When using Claude Code with vexify MCP:
1. Vexify syncs the target directory before every search
2. Searches run on latest code (respects .gitignore)
3. Results include file paths and line numbers
4. Supports natural language code queries

Configure in `~/.claude/claude_desktop.json`:
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

## Performance Notes

- **Embedding bottleneck**: Ollama inference speed (GPU acceleration recommended)
- **Storage**: SQLite handles millions of vectors efficiently
- **Search**: sqlite-vec is 10-100x faster than cosine fallback
- **Crawling**: Playwright is memory-intensive; web crawler limits depth/pages

## Dependencies

Core dependencies (locked in package.json):
- `better-sqlite3`: Fast SQLite binding
- `sqlite-vec`: Vector similarity extension
- `jsdom`: HTML parsing (with markdown fallback)
- `@mozilla/readability`: Article extraction
- `node-html-markdown`: HTML → Markdown conversion
- `playwright`: Web crawling
- `pdfjs-dist`: PDF text extraction
- `exceljs`: Excel processing
- `officeparser`: DOCX parsing

All dependencies are in `package.json` dependencies (not devDependencies).

## Deployment

Vexify is published on npm under `vexify` package name.

**Publish steps**:
1. Bump version in `package.json`
2. Commit with message `chore: bump version to X.Y.Z`
3. Run `npm publish`
4. Tag created automatically by NPM

For bug fixes to lib code, use `fix:` commit prefix. Version bumps use `chore:` prefix.

## Technical Gotchas

**Comments in Code**: Most comments should be replaced with clearer variable/function names. When found, evaluate if the name can be more explicit.

**Vector Dimension Mismatch**: Embeddings must match the model output (384 for nomic-embed-text). `lib/adapters/sqlite.js` stores as Float32Array - dimension changes require migration.

**Concurrent Database Writes**: SQLite allows only one writer at a time. Multiple processes syncing to same `.db` will deadlock. Each database path should be exclusive to one process.

**Playwright Memory**: Web crawler can exhaust RAM on large sites. `lib/crawlers/web.js` limits pages/depth to mitigate. Increasing limits risks OOM.

**Ollama Model Pulling**: First embedding request auto-pulls model from ollama.ai (2GB+ download). Offline environments need pre-pulled models via `ollama pull nomic-embed-text`.

**WSL Host Detection Timeout**: `lib/embedders/ollama.js` line 26 - execSync command for WSL gateway detection has 2000ms timeout to prevent blocking MCP server startup.

**Google Drive Quota**: Service account API has quota limits. Incremental sync helps but large shared drives may still hit rate limits - space out calls.

**Dedup Hash Collisions**: Content uses SHA-256 for dedup in `lib/processors/dedup.js`. Same hash = duplicate even if source differs. Unlikely but possible with content fragments.

**Search Algorithm Fallback**: If sqlite-vec extension missing, falls back to cosine similarity. This is 10-100x slower and may timeout on large datasets.

**File Encoding**: Processors assume UTF-8. Non-UTF-8 documents may produce garbled text or fail. PDFs with embedded fonts sometimes fail extraction.
