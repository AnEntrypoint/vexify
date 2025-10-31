# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vexify** is a portable vector database with semantic search, built on SQLite + Ollama embeddings. It processes multiple document formats (PDF, HTML, DOCX, JSON, CSV, XLSX), crawls websites, syncs Google Drive folders, and provides an MCP server for Claude Code integration.

**Key characteristic**: Zero-config, local-first, CommonJS-compatible. No external APIs required.

## Architecture

### Core Layers

**Storage Layer** (`lib/adapters/sqlite.js`):
- SQLite with sqlite-vec extension for vector operations
- Embeddings stored as float arrays
- Document metadata with source tracking

**Embedding Layer** (`lib/embedders/ollama.js`):
- Ollama server (auto-installed on first use)
- Default model: nomic-embed-text (384-dim vectors)
- Lazy-loads dependencies to avoid blocking
- Handles retries and model pulling

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

```bash
# Publish to npm (after version bump in package.json)
npm publish

# Test MCP server locally
npx vexify mcp --directory . --db-path ./.vexify.db

# Run CLI commands
npx vexify sync ./test.db ./documents
npx vexify query ./test.db "search term" 5
npx vexify crawl https://example.com --max-pages 50

# Check for large/complex functions (maintenance)
find lib -name "*.js" -exec wc -l {} \; | sort -rn | head -10
```

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

- **No test files**: Manual testing via CLI commands and MCP server
- **Ground truth only**: All test data real (PDFs from SARS, tax acts from gov.za)
- **Verify locally**: Use `.vexify.db` in project root for development

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

- **v0.16.27**: Fixed HTML text extraction with markdown fallback (jsdom parse5 compatibility)
- **v0.16.26**: Auto-sync in MCP silent mode
- **v0.16.25**: Optimized MCP server startup
- **v0.16.24**: Fixed recursive file scanning in code crawler
- **v0.16.23**: Added JavaScript support to txt processor

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
