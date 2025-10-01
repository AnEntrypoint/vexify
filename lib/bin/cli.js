#!/usr/bin/env node
'use strict';

const { VecStoreFactory, FolderSync, getConfig, processors, WebCrawler, Updater } = require('../index');
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
  const modelName = args.find(arg => !arg.startsWith('--') && arg !== args[1] && arg !== folderPath);

  const extensionsArg = args.find(arg => arg.startsWith('--extensions'));
  const extensions = extensionsArg ? extensionsArg.split('=')[1].split(',').map(e => e.trim()) : undefined;

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
  console.log(`Extensions: ${config.extensions.join(', ')}`);
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
  if (args.length < 3) {
    console.error('Usage: vexify crawl <url> <output-dir> [--max-pages N] [--max-depth N] [--db-path path] [--model name]');
    process.exit(1);
  }

  const url = args[1];
  const outputDir = args[2];

  const maxPagesArg = args.find(arg => arg.startsWith('--max-pages'));
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split('=')[1]) : 100;

  const maxDepthArg = args.find(arg => arg.startsWith('--max-depth'));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1]) : 3;

  const dbPathArg = args.find(arg => arg.startsWith('--db-path'));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : null;

  const modelArg = args.find(arg => arg.startsWith('--model'));
  const modelName = modelArg ? modelArg.split('=')[1] : null;

  const crawler = new WebCrawler({ maxPages, maxDepth });

  console.log(`Crawling site: ${url}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Max pages: ${maxPages}, Max depth: ${maxDepth}\n`);

  let vecStore = null;
  if (dbPath) {
    const config = getConfig({ dbPath, modelName });
    vecStore = await VecStoreFactory.create(config);
  }

  const results = await crawler.crawlSite(url, outputDir, vecStore);

  console.log(`\n✓ Site crawl completed:`);
  console.log(`  Pages: ${results.pages.length}`);
  console.log(`  Files: ${results.files.length}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (vecStore && results.pages.length > 0) {
    console.log(`\nIndexing crawled content...`);
    const processors = require('../processors');
    const HtmlProcessor = processors.getProcessor('.html');

    let added = 0;
    let skipped = 0;

    for (const page of results.pages) {
      const processor = new HtmlProcessor();
      const documents = await processor.process(page.path);

      for (const doc of documents) {
        doc.metadata.crawlUrl = url;
        doc.metadata.source = 'crawl';

        const result = await vecStore.addDocument(doc.id, doc.content, doc.metadata);
        if (result.skipped) {
          skipped++;
        } else {
          added++;
        }
      }
    }

    console.log(`✓ Indexed: ${added} documents, Skipped: ${skipped} duplicates`);
  }

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
  crawl <url> <output-dir> [opts]             Crawl site and optionally index
  update <db-path> [model]                    Re-embed old documents with new version
  processors                                   List supported file formats
  help                                         Show this help message

Sync Options:
  --extensions .pdf,.txt     File extensions to process (default: all supported)
  --no-recursive             Don't scan subfolders

Crawl Options:
  --max-pages N              Maximum pages to crawl (default: 100)
  --max-depth N              Maximum link depth (default: 3)
  --db-path path             Index into database (clears old content from URL)
  --model name               Embedding model to use

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
  npx vexify crawl https://example.com ./crawled --max-pages=50
  npx vexify crawl https://example.com ./crawled --db-path=./db.db
  npx vexify update ./mydb.db
  npx vexify processors

Default model: embeddinggemma (via Ollama)
Ollama auto-installs to node_modules/.ollama/ if not available
Note: HTML files are auto-converted to Markdown via sync
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
      case 'crawl':
        await crawl();
        break;
      case 'update':
        await update();
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
