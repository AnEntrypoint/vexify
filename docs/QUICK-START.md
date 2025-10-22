# Vexify Quick Start Guide

## Installation

```bash
npm install vecstore-js
# or
npx vexify <command>
```

## Basic Usage

### 1. Initialize Database
```bash
npx vexify init ./mydb.db
```

### 2. Sync Local Folder
```bash
npx vexify sync ./mydb.db ./documents
```

### 3. Search
```bash
npx vexify query ./mydb.db "your search query" 10
```

## Advanced Features

### Web Crawling
```bash
npx vexify crawl https://example.com --max-pages=100
```

### Google Drive Sync

**Full sync:**
```bash
npx vexify gdrive ./mydb.db <folder-id> \
  --service-account ./sa.json \
  --impersonate admin@domain.com
```

**Incremental (1 file at a time):**
```bash
npx vexify gdrive ./mydb.db <folder-id> \
  --service-account ./sa.json \
  --impersonate admin@domain.com \
  --incremental
```

## Supported Formats

- **Documents:** PDF, DOCX, DOC, TXT
- **Web:** HTML
- **Data:** JSON, CSV, XLSX, XLS
- **Google:** Docs, Sheets (auto-exported)

## Models

**Default:** `nomic-embed-text` (fast, cross-platform)  
**Alternative:** `embeddinggemma` (higher quality, slower)

Specify with `--model <name>` on any command.

## Documentation

- [Google Drive Setup](./GDRIVE-SETUP.md) - Complete authentication guide
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Architecture details
- [Performance Audit](./PERFORMANCE_AUDIT.md) - GPU optimization guide

## Examples

### Sync and search PDF library
```bash
npx vexify sync ./library.db ~/Documents/PDFs
npx vexify query ./library.db "machine learning algorithms" 5
```

### Incremental Drive sync loop
```bash
for i in {1..50}; do
  npx vexify gdrive ./work.db root \
    --service-account ./sa.json \
    --impersonate me@company.com \
    --incremental
  sleep 2
done
```

### Crawl documentation site
```bash
npx vexify crawl https://docs.example.com \
  --max-pages=500 \
  --db-path=./docs.db
```
