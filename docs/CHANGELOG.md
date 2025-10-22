# Changelog

## 2025-10-03 - Google Drive Integration & Optimization

### Added
- **Google Drive sync capability**
  - Service account with domain-wide delegation support
  - OAuth 2.0 user login fallback
  - Auto-export Google Docs/Sheets to compatible formats
  - Drive URLs stored in metadata

- **Smart sync with modification tracking**
  - Single bulk folder scan (pageSize=1000)
  - Smart work planning: compares modifiedTime to detect changes
  - Only processes new/updated files
  - Handles deletions automatically
  - Minimal API calls for efficiency

- **Incremental sync mode** (`--incremental` flag)
  - Process one file at a time
  - State persistence in `.gdrive-sync-state.json`
  - Resume capability across invocations

- **CLI command:** `gdrive`
  ```bash
  npx vexify gdrive <db-path> <folder-id> [options]
  ```

### Options
- `--service-account <path>` - Service account JSON file
- `--impersonate <email>` - Email to impersonate (domain-wide delegation)
- `--client-secret <path>` - OAuth client secret JSON
- `--max-files <N>` - Maximum files to process
- `--incremental` - Process 1 file at a time with resume support

### Code Quality
- Removed all comments from codebase
- Consolidated duplicate processor patterns into BaseProcessor
- Removed unused files (gdrive.js, eng.traineddata)
- DRY processor inheritance (process/processBuffer/processContent)

### Documentation
- `docs/GDRIVE-SETUP.md` - Complete auth setup guide
- `docs/QUICK-START.md` - Quick reference
- `docs/PERFORMANCE_AUDIT.md` - Performance analysis
- `docs/IMPLEMENTATION_SUMMARY.md` - Architecture details

---

## Previous Updates

### Web Crawler
- Playwright-based web scraping
- Session management with cookie persistence
- Text deduplication for common boilerplate

### Folder Sync
- Auto-discovery of supported file types
- Tracks additions and removals
- Parallel file processing with GPU pipeline

### Processors
- PDF (with OCR support via Tesseract)
- DOCX, DOC
- HTML, JSON, CSV, XLSX, XLS
- TXT
