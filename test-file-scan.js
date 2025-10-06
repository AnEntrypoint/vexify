#!/usr/bin/env node
'use strict';

const { CodeCrawler } = require('./lib/crawlers/code');

async function test() {
  console.log('Scanning files that would be processed...');

  const crawler = new CodeCrawler({
    rootPath: '/home/user/docstudio/mcp-server',
    maxDepth: 5,
    maxFileSize: 1024 * 1024,
    includeBinary: false,
    customIgnorePatterns: []
  });

  const startTime = Date.now();
  const results = await crawler.crawl();
  const endTime = Date.now();

  console.log(`\n✓ File scan completed in ${((endTime - startTime) / 1000).toFixed(1)}s:`);
  console.log(`   Total files found: ${results.stats.totalFiles}`);
  console.log(`   Files that would be indexed: ${results.stats.indexedFiles}`);
  console.log(`   Files skipped: ${results.stats.skippedFiles}`);
  console.log(`   Errors: ${results.stats.errors}`);

  if (results.files.length > 0) {
    console.log(`\nFiles that would be indexed:`);
    results.files.forEach((file, i) => {
      console.log(`  ${i + 1}. ${file.language} (${file.extension}): ${file.path} (${Math.round(file.size / 1024)}KB)`);
      if (file.size < 150) {
        console.log(`      ⚠ Too short: ${file.size} chars`);
      }
    });
  }

  process.exit(0);
}

test().catch(console.error);