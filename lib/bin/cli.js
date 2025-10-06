#!/usr/bin/env node
'use strict';

const { VecStoreFactory, FolderSync, getConfig, processors, WebCrawler, Updater } = require('../index');
const { GoogleDriveCrawler } = require('../crawlers/gdrive');
const { CodeCrawler } = require('../crawlers/code');
const { MCPServer } = require('../mcp/server');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

async function init() {
  const config = getConfig({
    dbPath: args[1],
    modelName: args[2]
  });

  console.log(`Initializing vecstore with database: ${config.dbPath}`);
  console.log(`Using model: ${config.modelName}`);

  const vecStore = await VecStoreFactory.create(config);

  console.log('✓ VecStore initialized successfully');
  process.exit(0);
}

async function add() {
  if (args.length < 4) {
    console.error('Usage: vexify add <db-path> <id> <text> [model]');
    process.exit(1);
  }

  const id = args[2];
  const text = args[3];
  const config = getConfig({
    dbPath: args[1],
    modelName: args[4]
  });

  const vecStore = await VecStoreFactory.create(config);
  await vecStore.addDocument(id, text);

  console.log(`✓ Added document: ${id}`);
  process.exit(0);
}

async function query() {
  if (args.length < 3) {
    console.error('Usage: vexify query <db-path> <query-text> [topK] [model]');
    process.exit(1);
  }

  const queryText = args[2];
  const config = getConfig({
    dbPath: args[1],
    topK: parseInt(args[3]),
    modelName: args[4]
  });

  const vecStore = await VecStoreFactory.create(config);
  const results = await vecStore.query(queryText, config.topK);

  console.log(`\nTop ${config.topK} results:\n`);
  results.forEach((result, i) => {
    console.log(`${i + 1}. [${result.id}] (score: ${result.score.toFixed(4)})`);

    if (result.metadata?.crawlUrl) {
      console.log(`   URL: ${result.metadata.crawlUrl}`);
    }

    if (result.metadata?.pageNumber) {
      console.log(`   Page: ${result.metadata.pageNumber}/${result.metadata.totalPages || '?'}`);
    }

    console.log(`   ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}\n`);
  });

  process.exit(0);
}

function listProcessors() {
  const extensions = processors.getAllExtensions();

  console.log('\nSupported file formats:\n');

  const groups = {
    'Documents': ['.pdf', '.docx', '.doc', '.txt', '.text'],
    'Web': ['.html', '.htm'],
    'Data': ['.json', '.jsonl', '.csv', '.xlsx', '.xls']
  };

  Object.entries(groups).forEach(([name, exts]) => {
    const available = exts.filter(e => extensions.includes(e));
    if (available.length > 0) {
      console.log(`  ${name}:`, available.join(', '));
    }
  });

  console.log('\nTotal:', extensions.length, 'formats supported');
  console.log('\nAll extensions:', extensions.join(', '));

  process.exit(0);
}

async function syncFolder() {
  if (args.length < 3) {
    console.error('Usage: vexify sync <db-path> <folder-path> [model] [--extensions .pdf,.txt] [--no-recursive]');
    process.exit(1);
  }

  const folderPath = args[2];

  const extensionsArgIndex = args.findIndex(arg => arg.startsWith('--extensions'));
  let extensions = undefined;
  let extensionValues = [];
  if (extensionsArgIndex !== -1) {
    const extensionsArg = args[extensionsArgIndex];
    if (extensionsArg.includes('=')) {
      extensions = extensionsArg.split('=')[1].split(',').map(e => e.trim());
    } else if (extensionsArgIndex + 1 < args.length) {
      extensionValues = args[extensionsArgIndex + 1].split(',');
      extensions = extensionValues.map(e => e.trim());
    }
  }

  const modelName = args.find(arg =>
    !arg.startsWith('--') &&
    arg !== args[0] &&
    arg !== args[1] &&
    arg !== folderPath &&
    !extensionValues.includes(arg)
  );

  const recursive = args.includes('--no-recursive') ? false : undefined;

  const config = getConfig({
    dbPath: args[1],
    modelName,
    extensions,
    recursive
  });

  if (!fs.existsSync(folderPath)) {
    console.error(`Error: Folder not found: ${folderPath}`);
    process.exit(1);
  }

  const vecStore = await VecStoreFactory.create(config);
  const folderSync = new FolderSync(vecStore, config);

  console.log(`Syncing folder: ${folderPath}`);
  console.log(`Extensions: ${config.extensions ? config.extensions.join(', ') : 'all supported'}`);
  console.log(`Recursive: ${config.recursive}\n`);

  const results = await folderSync.sync(folderPath);

  console.log(`\n✓ Sync completed:`);
  console.log(`  Added: ${results.added} documents`);
  console.log(`  Skipped: ${results.skipped} duplicates`);
  console.log(`  Removed: ${results.removed} files`);

  if (results.errors.length > 0) {
    console.log(`\n⚠ Errors (${results.errors.length}):`);
    results.errors.forEach(err => {
      console.log(`  - ${err.file}: ${err.error}`);
    });
  }

  process.exit(0);
}

async function crawl() {
  if (args.length < 2) {
    console.error('Usage: vexify crawl <url> [output-dir] [--max-pages N] [--max-depth N] [--db-path path] [--model name]');
    process.exit(1);
  }

  const url = args[1];
  const outputDirArg = args.find((arg, i) => i > 1 && !arg.startsWith('--'));
  const outputDir = outputDirArg || `./${new URL(url).hostname.replace(/^www\./, '')}`;

  const maxPagesArg = args.find(arg => arg.startsWith('--max-pages'));
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split('=')[1]) : 10000;

  const maxDepthArg = args.find(arg => arg.startsWith('--max-depth'));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1]) : 3;

  const dbPathArg = args.find(arg => arg.startsWith('--db-path'));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : `${outputDir}.db`;

  const modelArg = args.find(arg => arg.startsWith('--model'));
  const modelName = modelArg ? modelArg.split('=')[1] : 'embeddinggemma';

  const concurrencyArg = args.find(arg => arg.startsWith('--concurrency'));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]) : 3;

  const stateFile = `${outputDir}/.crawl-state.json`;

  const crawler = new WebCrawler({ maxPages, maxDepth, concurrency, stateFile });

  console.log(`Crawling site: ${url}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Max pages: ${maxPages}, Max depth: ${maxDepth}\n`);

  let vecStore = null;
  let indexed = { added: 0, skipped: 0 };

  const config = getConfig({ dbPath, modelName });
  vecStore = await VecStoreFactory.create(config);

  const { TextDeduplicator } = require('../processors/dedup');
  const dedup = new TextDeduplicator(50, 2);
  const analysisPages = [];
  const analysisBatchSize = 5;

  const onPageCrawled = async (page) => {
    const processors = require('../processors');
    const ext = require('path').extname(page.path).toLowerCase();
    const ProcessorClass = processors.getProcessor(ext);

    if (!ProcessorClass) {
      console.log(`  ⚠ No processor for ${ext}`);
      return;
    }

    const processor = new ProcessorClass();
    let documents;
    try {
      documents = await processor.process(page.path, { url: page.url });
    } catch (error) {
      console.log(`  ⚠ Failed to process ${page.path}: ${error.message}`);
      return;
    }

    if (ext === '.html' || ext === '.htm') {
      if (analysisPages.length < analysisBatchSize) {
        analysisPages.push(...documents.map(d => d.content));

        if (analysisPages.length >= analysisBatchSize) {
          const commonCount = dedup.analyzeDocuments(analysisPages);
          console.log(`  Analyzed ${analysisPages.length} pages, found ${commonCount} common text patterns\n`);
        }
      }
    }

    for (const doc of documents) {
      if (ext === '.html' || ext === '.htm') {
        if (dedup.analyzed) {
          doc.content = dedup.deduplicate(doc.content);
        }
      }

      doc.metadata.source = 'crawl';
      if (page.url) {
        doc.metadata.crawlUrl = page.url;
      }

      const result = await vecStore.addDocument(doc.id, doc.content, doc.metadata);
      if (result.skipped) {
        indexed.skipped++;
      } else {
        indexed.added++;
      }
    }
  };

  const results = await crawler.crawlSite(url, outputDir, vecStore, onPageCrawled);

  console.log(`\n✓ Site crawl completed:`);
  console.log(`  Pages: ${results.pages.length}`);
  console.log(`  Files: ${results.files.length}`);
  console.log(`  Errors: ${results.errors.length}`);
  console.log(`✓ Indexed: ${indexed.added} documents, Skipped: ${indexed.skipped} duplicates`);

  process.exit(0);
}

async function update() {
  if (args.length < 2) {
    console.error('Usage: vexify update <db-path> [model]');
    process.exit(1);
  }

  const config = getConfig({
    dbPath: args[1],
    modelName: args[2]
  });

  const vecStore = await VecStoreFactory.create(config);
  const updater = new Updater(vecStore);

  console.log(`Updating embeddings to version ${vecStore.version}...`);

  const results = await updater.updateAll();

  console.log(`\n✓ Update completed:`);
  console.log(`  Checked: ${results.checked} documents`);
  console.log(`  Reprocessed: ${results.reprocessed} documents`);

  if (results.errors.length > 0) {
    console.log(`\n⚠ Errors (${results.errors.length}):`);
    results.errors.forEach(err => {
      console.log(`  - ${err.id}: ${err.error}`);
    });
  }

  process.exit(0);
}

async function syncGdrive() {
  if (args.length < 3) {
    console.error('Usage: vexify gdrive <db-path> <folder-id> [options]');
    console.error('\nOptions:');
    console.error('  --service-account <path>    Path to service account JSON');
    console.error('  --impersonate <email>       Email to impersonate (with service account)');
    console.error('  --client-secret <path>      Path to OAuth client secret JSON');
    console.error('  --max-files <N>             Maximum files to process (default: 1000)');
    console.error('  --model <name>              Embedding model (default: nomic-embed-text)');
    console.error('  --incremental               Process 1 file at a time, resume on next call');
    process.exit(1);
  }

  const dbPath = args[1];
  const folderId = args[2] || 'root';

  const options = {};
  for (let i = 3; i < args.length; i++) {
    if (args[i] === '--service-account') {
      options.serviceAccountPath = args[++i];
    } else if (args[i] === '--impersonate') {
      options.impersonateEmail = args[++i];
    } else if (args[i] === '--client-secret') {
      options.clientSecretPath = args[++i];
    } else if (args[i] === '--max-files') {
      options.maxFiles = parseInt(args[++i]);
    } else if (args[i] === '--model') {
      options.modelName = args[++i];
    } else if (args[i] === '--incremental') {
      options.incrementalMode = true;
      options.maxFiles = 1;
    }
  }

  if (!options.serviceAccountPath && !options.clientSecretPath) {
    console.error('\nError: Must provide either --service-account or --client-secret');
    process.exit(1);
  }

  const config = getConfig({ dbPath, modelName: options.modelName });
  const vecStore = await VecStoreFactory.create(config);

  const crawler = new GoogleDriveCrawler(options);

  console.log('\n📂 Google Drive Sync');
  console.log(`Database: ${dbPath}`);
  console.log(`Folder ID: ${folderId}`);
  if (options.impersonateEmail) {
    console.log(`Impersonating: ${options.impersonateEmail}`);
  }
  console.log(`Max files: ${options.maxFiles || 1000}\n`);

  const results = await crawler.crawl(folderId, vecStore);

  console.log(`\n✓ Google Drive sync completed:`);
  console.log(`  New: ${results.processed} files`);
  console.log(`  Updated: ${results.updated} files`);
  console.log(`  Skipped (unchanged): ${results.skipped} files`);
  console.log(`  Deleted: ${results.deleted} files`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n⚠ Errors:`);
    results.errors.slice(0, 5).forEach(err => {
      console.log(`  - ${err.file || err.folderId}: ${err.error}`);
    });
    if (results.errors.length > 5) {
      console.log(`  ... and ${results.errors.length - 5} more`);
    }
  }

  process.exit(0);
}

async function crawlCode() {
  const rootPath = args[1];
  if (!rootPath) {
    console.error('Usage: vexify code <directory-path> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --db-path <path>        Database file (default: ./code.db)');
    console.error('  --model <name>          Embedding model (default: unclemusclez/jina-embeddings-v2-base-code)');
    console.error('  --max-depth <N>         Maximum directory depth (default: 10)');
    console.error('  --max-size <MB>         Maximum file size in MB (default: 1)');
    console.error('  --include-binary        Include binary files');
    console.error('  --ignore <pattern>      Additional ignore pattern (can be used multiple times)');
    process.exit(1);
  }

  // Parse options
  let dbPath = './code.db';
  let modelName = 'unclemusclez/jina-embeddings-v2-base-code';
  let maxDepth = 10;
  let maxSizeMB = 1;
  let includeBinary = false;
  let customIgnorePatterns = [];

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case '--db-path':
        dbPath = args[++i];
        break;
      case '--model':
        modelName = args[++i];
        break;
      case '--max-depth':
        maxDepth = parseInt(args[++i]);
        break;
      case '--max-size':
        maxSizeMB = parseInt(args[++i]);
        break;
      case '--include-binary':
        includeBinary = true;
        break;
      case '--ignore':
        customIgnorePatterns.push(args[++i]);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  // Validate directory exists
  if (!fs.existsSync(rootPath)) {
    console.error(`Directory not found: ${rootPath}`);
    process.exit(1);
  }

  const config = getConfig({
    dbPath,
    modelName
  });

  const vecStore = await VecStoreFactory.create(config);

  console.log(`🔍 Code repository crawler`);
  console.log(`Directory: ${rootPath}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Model: ${modelName}`);
  console.log(`Max depth: ${maxDepth}`);
  console.log(`Max file size: ${maxSizeMB}MB`);
  if (customIgnorePatterns.length > 0) {
    console.log(`Custom ignore patterns: ${customIgnorePatterns.join(', ')}`);
  }
  console.log('');

  const crawler = new CodeCrawler({
    rootPath,
    maxDepth,
    maxFileSize: maxSizeMB * 1024 * 1024,
    includeBinary,
    customIgnorePatterns
  });

  let indexed = { added: 0, skipped: 0 };

  const onPageCrawled = async (doc) => {
    const result = await vecStore.addDocument(doc.id, doc.content, doc.metadata);
    if (result.skipped) {
      indexed.skipped++;
    } else {
      indexed.added++;
    }
  };

  const results = await crawler.crawl(vecStore, onPageCrawled);

  console.log(`\n✓ Code repository crawl completed:`);
  console.log(`  Files indexed: ${indexed.added}`);
  console.log(`  Duplicates skipped: ${indexed.skipped}`);
  console.log(`  Total files processed: ${results.stats.totalFiles}`);
  console.log(`  Errors: ${results.stats.errors}`);

  process.exit(0);
}

async function startMcpServer() {
  const options = {};

  // Parse MCP-specific options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--db-path') {
      options.dbPath = args[++i];
    } else if (args[i] === '--directory') {
      options.directory = args[++i];
    } else if (args[i] === '--model') {
      options.modelName = args[++i];
    } else if (args[i] === '--sync-interval') {
      options.syncInterval = parseInt(args[++i]) * 1000; // Convert seconds to ms
    }
  }

  const server = new MCPServer(options);

  try {
    await server.start();
  } catch (error) {
    console.error('MCP server error:', error.message);
    process.exit(1);
  }
}

function help() {
  console.log(`
vexify - Portable vector database with auto-installing Ollama

Usage:
  npx vexify <command> [options]

Commands:
  init <db-path> [model]                      Initialize a new vector store
  add <db-path> <id> <text> [model]           Add a document
  query <db-path> <query> [topK] [model]      Query the vector store
  sync <db-path> <folder-path> [model] [opts] Sync folder with database
  crawl <url> [output-dir] [opts]             Crawl site with automatic indexing
  code <directory-path> [opts]                Index code repository with smart ignore patterns
  gdrive <db-path> <folder-id> [opts]         Sync Google Drive folder
  update <db-path> [model]                    Re-embed old documents with new version
  mcp [options]                               Start MCP server for agent integration
  processors                                   List supported file formats
  help                                         Show this help message

Sync Options:
  --extensions .pdf,.txt     File extensions to process (default: all supported)
  --no-recursive             Don't scan subfolders

Crawl Options:
  --max-pages N              Maximum pages to crawl (default: 10000)
  --max-depth N              Maximum link depth (default: 3)
  --db-path path             Database path (default: <output-dir>.db)
  --model name               Embedding model (default: nomic-embed-text)
  --concurrency N            Parallel browser instances (default: 3)

Code Options:
  --db-path <path>           Database file (default: ./code.db)
  --model <name>             Embedding model (default: unclemusclez/jina-embeddings-v2-base-code)
  --max-depth <N>            Maximum directory depth (default: 10)
  --max-size <MB>            Maximum file size in MB (default: 1)
  --include-binary           Include binary files
  --ignore <pattern>         Additional ignore pattern

Google Drive Options:
  --service-account <path>   Service account JSON (domain-wide delegation)
  --impersonate <email>      Email to impersonate (requires service account)
  --client-secret <path>     OAuth client secret JSON (user login)
  --max-files N              Maximum files to process (default: 1000)
  --model name               Embedding model (default: nomic-embed-text)

MCP Server Options:
  --db-path <path>           Database file (default: ./vexify-mcp.db)
  --directory <path>         Directory to index/search (default: current directory)
  --model <name>             Embedding model (default: unclemusclez/jina-embeddings-v2-base-code)
  --sync-interval <seconds>  Auto-sync interval (default: 300)

Crawl Features:
  ✓ Automatic resume on Ctrl+C - state saved to .crawl-state.json
  ✓ Auto-indexes to database by default
  ✓ Cloudflare bypass with stealth mode
  ✓ Text deduplication (removes common boilerplate)
  ✓ Skips already-crawled URLs from database

Supported Formats:
  Documents: .pdf, .docx, .doc, .txt
  Web: .html, .htm
  Data: .json, .jsonl, .csv, .xlsx, .xls

Examples:
  npx vexify init ./mydb.db
  npx vexify add ./mydb.db doc1 "Hello world"
  npx vexify query ./mydb.db "greeting" 5
  npx vexify sync ./mydb.db ./docs
  npx vexify sync ./mydb.db ./docs --extensions .pdf,.docx
  npx vexify crawl https://example.com
  npx vexify crawl https://example.com --max-pages=5000
  npx vexify code ./my-project --model unclemusclez/jina-embeddings-v2-base-code
  npx vexify code ./my-project --max-size 5 --ignore "*.test.js" --ignore "coverage/**"
  npx vexify gdrive ./mydb.db root --service-account ./sa.json --impersonate user@domain.com
  npx vexify gdrive ./mydb.db 1ABC_folderID --client-secret ./oauth.json
  npx vexify update ./mydb.db
  npx vexify mcp --directory ./my-project --db-path ./project.db
  npx vexify mcp --directory ~/docstudio --sync-interval 600
  npx vexify processors

Default model: nomic-embed-text (via Ollama) - fast, cross-platform (x86, ARM, Apple Silicon)
Ollama auto-installs to node_modules/.ollama/ if not available
Note: Crawl automatically resumes if interrupted - just rerun the same command
`);
  process.exit(0);
}

async function main() {
  try {
    switch (command) {
      case 'init':
        await init();
        break;
      case 'add':
        await add();
        break;
      case 'query':
        await query();
        break;
      case 'sync':
        await syncFolder();
        break;
      case 'code':
        await crawlCode();
        break;
      case 'crawl':
        await crawl();
        break;
      case 'gdrive':
        await syncGdrive();
        break;
      case 'update':
        await update();
        break;
      case 'mcp':
        await startMcpServer();
        break;
      case 'processors':
        listProcessors();
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        help();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        help();
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
