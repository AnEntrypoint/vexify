'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class WebCrawler {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.userAgent = options.userAgent;
    this.timeout = options.timeout || 30000;
    this.maxPages = options.maxPages || 100;
    this.maxDepth = options.maxDepth || 3;
    this.visited = new Set();
    this.queue = [];
    this.supportedExtensions = options.supportedExtensions || [
      '.html', '.htm', '.pdf', '.docx', '.doc', '.txt', '.text',
      '.csv', '.json', '.jsonl', '.xlsx', '.xls'
    ];
  }

  async crawlSite(startUrl, outputDir, vecStore = null) {
    const { chromium } = require('playwright');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseUrl = new URL(startUrl);

    if (vecStore) {
      console.log('  Clearing existing content from this URL...');
      const cleared = await vecStore.clearSource('crawlUrl', startUrl);
      console.log(`  Removed ${cleared} old documents\n`);
    }

    const browser = await chromium.launch({ headless: this.headless });
    const context = await browser.newContext({
      userAgent: this.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    this.queue.push({ url: startUrl, depth: 0 });

    const results = {
      pages: [],
      files: [],
      errors: []
    };

    while (this.queue.length > 0 && this.visited.size < this.maxPages) {
      const { url, depth } = this.queue.shift();

      if (this.visited.has(url) || depth > this.maxDepth) {
        continue;
      }

      this.visited.add(url);

      try {
        const urlObj = new URL(url);

        if (urlObj.hostname !== baseUrl.hostname) {
          continue;
        }

        const ext = path.extname(urlObj.pathname).toLowerCase();

        if (this.supportedExtensions.includes(ext) && ext !== '.html' && ext !== '.htm') {
          const fileName = this.getFileName(url, outputDir);
          await this.downloadFile(url, fileName);
          results.files.push({ url, path: fileName });
          console.log(`  Downloaded: ${url}`);
          continue;
        }

        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });

        const html = await page.content();
        const fileName = this.getFileName(url, outputDir, '.html');
        fs.writeFileSync(fileName, html, 'utf-8');

        results.pages.push({ url, path: fileName });
        console.log(`  Crawled: ${url}`);

        if (depth < this.maxDepth) {
          const links = await page.$$eval('a[href]', anchors =>
            anchors.map(a => a.href)
          );

          for (const link of links) {
            try {
              const linkUrl = new URL(link, url).href;
              if (!this.visited.has(linkUrl)) {
                this.queue.push({ url: linkUrl, depth: depth + 1 });
              }
            } catch (e) {
            }
          }
        }

        await page.close();

      } catch (error) {
        results.errors.push({ url, error: error.message });
        console.log(`  Error: ${url} - ${error.message}`);
      }
    }

    await browser.close();

    return results;
  }

  async downloadFile(url, outputPath) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
  }

  getFileName(url, outputDir, forceExt = null) {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;

    if (pathname === '/' || pathname === '') {
      pathname = '/index';
    }

    if (forceExt) {
      pathname = pathname.replace(/\.[^.]*$/, '') + forceExt;
    }

    const sanitized = pathname.replace(/^\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(outputDir, sanitized || 'index.html');
  }
}

module.exports = { WebCrawler };
