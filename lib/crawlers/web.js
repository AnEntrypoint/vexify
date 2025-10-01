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
    this.concurrency = options.concurrency || 10;
    this.visited = new Set();
    this.queue = [];
    this.supportedExtensions = options.supportedExtensions || [
      '.html', '.htm', '.pdf', '.docx', '.doc', '.txt', '.text',
      '.csv', '.json', '.jsonl', '.xlsx', '.xls'
    ];
  }

  normalizeHostname(hostname) {
    return hostname.replace(/^www\./, '');
  }

  async crawlSite(startUrl, outputDir, vecStore = null) {
    const { chromium } = require('playwright');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseUrl = new URL(startUrl);
    const baseHostname = this.normalizeHostname(baseUrl.hostname);

    if (vecStore) {
      console.log('  Loading already-crawled URLs to avoid duplicates...');
      const crawledUrls = await vecStore.store.getCrawledUrls();
      console.log(`  Found ${crawledUrls.size} already-indexed URLs\n`);

      for (const url of crawledUrls) {
        this.visited.add(url);
      }
    }

    const browser = await chromium.launch({
      headless: this.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      userAgent: this.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    this.queue.push({ url: startUrl, depth: 0 });

    const results = {
      pages: [],
      files: [],
      errors: []
    };

    while (this.queue.length > 0 && this.visited.size < this.maxPages) {
      const batch = [];

      while (batch.length < this.concurrency && this.queue.length > 0 && this.visited.size + batch.length < this.maxPages) {
        const { url, depth } = this.queue.shift();

        if (this.visited.has(url) || depth > this.maxDepth) {
          continue;
        }

        this.visited.add(url);
        batch.push({ url, depth });
      }

      if (batch.length === 0) {
        break;
      }

      const batchResults = await Promise.all(batch.map(async ({ url, depth }) => {
        try {
          const urlObj = new URL(url);

          if (this.normalizeHostname(urlObj.hostname) !== baseHostname) {
            return null;
          }

          const ext = path.extname(urlObj.pathname).toLowerCase();

          if (this.supportedExtensions.includes(ext) && ext !== '.html' && ext !== '.htm') {
            const fileName = this.getFileName(url, outputDir);
            await this.downloadFile(url, fileName);
            console.log(`  Downloaded: ${url}`);
            return { type: 'file', url, path: fileName };
          }

          const page = await context.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });

          try {
            await page.waitForFunction(() => {
              const bodyText = document.body.innerText;
              return !bodyText.includes('Just a moment') &&
                     !bodyText.includes('Verifying you are human') &&
                     document.body.innerHTML.length > 10000;
            }, { timeout: 30000 });
          } catch (e) {
            console.log(`  ⚠ Cloudflare challenge timeout for ${url}`);
          }

          const html = await page.content();
          const fileName = this.getFileName(url, outputDir, '.html');
          fs.writeFileSync(fileName, html, 'utf-8');

          console.log(`  Crawled: ${url}`);

          let links = [];
          if (depth < this.maxDepth) {
            links = await page.$$eval('a[href]', anchors => anchors.map(a => a.href));
          }

          await page.close();

          return { type: 'page', url, path: fileName, links, depth };

        } catch (error) {
          console.log(`  Error: ${url} - ${error.message}`);
          return { type: 'error', url, error: error.message };
        }
      }));

      for (const result of batchResults) {
        if (!result) continue;

        if (result.type === 'page') {
          results.pages.push({ url: result.url, path: result.path });

          for (const link of result.links) {
            try {
              const linkUrl = new URL(link, result.url).href;
              if (!this.visited.has(linkUrl)) {
                this.queue.push({ url: linkUrl, depth: result.depth + 1 });
              }
            } catch (e) {
            }
          }
        } else if (result.type === 'file') {
          results.files.push({ url: result.url, path: result.path });
        } else if (result.type === 'error') {
          results.errors.push({ url: result.url, error: result.error });
        }
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
