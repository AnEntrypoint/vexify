'use strict';

const { VecStoreFactory, getConfig } = require('../index');
const { CodeCrawler } = require('../crawlers/code');
const { FolderSync } = require('../utils/folder-sync');
const fs = require('fs');
const path = require('path');

class MCPServer {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './.vexify.db';
    this.directory = options.directory || process.cwd();
    this.modelName = options.modelName || 'unclemusclez/jina-embeddings-v2-base-code';
    this.vecStore = null;
    this.lastSyncTime = null;
  }

  async initialize() {
    const config = getConfig({
      dbPath: this.dbPath,
      modelName: this.modelName
    });

    this.vecStore = await VecStoreFactory.create(config);
    console.error('Vexify MCP Server initialized (lazy indexing on first search)');
  }

  async ensureIndexSync() {
    try {
      // Check if database exists and has content
      const stats = await this.getDatabaseStats();

      if (stats.totalDocuments === 0) {
        console.error('Performing initial index sync...');
        await this.performSync();
      } else {
        // Check if files have been updated since last sync
        const needsSync = await this.checkIfSyncNeeded();
        if (needsSync) {
          console.error('Detected file changes, performing sync...');
          await this.performSync();
        } else {
          console.error('Index is up to date');
        }
      }

      this.lastSyncTime = Date.now();
    } catch (error) {
      console.error('Error during index sync:', error.message);
      throw error;
    }
  }

  async getDatabaseStats() {
    try {
      const stmt = this.vecStore.db.prepare('SELECT COUNT(*) as count FROM documents');
      const result = stmt.get();
      return { totalDocuments: result.count || 0 };
    } catch (error) {
      return { totalDocuments: 0 };
    }
  }

  async checkIfSyncNeeded() {
    try {
      // Simple check: if directory exists and we haven't synced recently
      if (!fs.existsSync(this.directory)) {
        return false;
      }

      // Check if any files have been modified recently
      const checkFile = (filePath) => {
        try {
          const stats = fs.statSync(filePath);
          const fileTime = stats.mtime.getTime();
          return fileTime > (this.lastSyncTime || 0);
        } catch {
          return false;
        }
      };

      // Check a few key files for changes
      const packageJsonPath = path.join(this.directory, 'package.json');
      if (checkFile(packageJsonPath)) return true;

      // Check if this is a code directory and look for source files
      const srcPath = path.join(this.directory, 'src');
      if (fs.existsSync(srcPath)) {
        const srcFiles = fs.readdirSync(srcPath).slice(0, 5); // Check first 5 files
        for (const file of srcFiles) {
          if (checkFile(path.join(srcPath, file))) return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking sync status:', error.message);
      return false; // Don't sync if we can't determine status
    }
  }

  async performSync() {
    try {
      if (!fs.existsSync(this.directory)) {
        throw new Error(`Directory not found: ${this.directory}`);
      }

      // Check if it's a code repository or document folder
      const isCodeRepo = this.isDirectoryCodeRepository(this.directory);

      if (isCodeRepo) {
        await this.syncCodeRepository();
      } else {
        await this.syncDocumentFolder();
      }

      // Ensure buffer is flushed
      await this.vecStore.flushBuffer();

      console.error('Sync completed successfully');
    } catch (error) {
      console.error('Error during sync:', error.message);
      throw error;
    }
  }

  isDirectoryCodeRepository(dirPath) {
    const indicators = [
      'package.json',
      'tsconfig.json',
      'Cargo.toml',
      'requirements.txt',
      'pyproject.toml',
      'pom.xml',
      'build.gradle'
    ];

    return indicators.some(indicator =>
      fs.existsSync(path.join(dirPath, indicator))
    );
  }

  async syncCodeRepository() {
    const crawler = new CodeCrawler({
      rootPath: this.directory,
      maxDepth: 10,
      maxFileSize: 1024 * 1024, // 1MB
      includeBinary: false,
      customIgnorePatterns: []
    });

    let indexed = { added: 0, skipped: 0 };

    const onPageCrawled = async (doc) => {
      const result = await this.vecStore.addDocument(doc.id, doc.content, doc.metadata);
      if (result.skipped) {
        indexed.skipped++;
      } else {
        indexed.added++;
      }
    };

    await crawler.crawl(this.vecStore, onPageCrawled);

    console.error(`Code sync: ${indexed.added} files indexed, ${indexed.skipped} skipped`);
  }

  async syncDocumentFolder() {
    const folderSync = new FolderSync(this.vecStore, {
      modelName: this.modelName,
      recursive: true
    });

    const results = await folderSync.sync(this.directory);

    console.error(`Document sync: ${results.added} files added, ${results.skipped} skipped`);
  }

  async search(query, options = {}) {
    const {
      topK = 5,
      includeContent = true,
      filters = {}
    } = options;

    try {
      // Always sync before search to ensure latest files are indexed (with timeout)
      console.error('Syncing index before search...');
      try {
        const syncPromise = this.performSync();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Search sync timeout')), 60000)
        );
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (syncError) {
        console.error(`Sync before search failed: ${syncError.message}`);
        console.error('Proceeding with search using existing index...');
      }

      // Perform search
      const results = await this.vecStore.query(query, topK);

      // Format results for MCP response
      return results.map(result => ({
        id: result.id,
        score: result.score,
        content: includeContent ? result.content : null,
        metadata: result.metadata || {},
        snippet: this.createSnippet(result.content, query)
      }));
    } catch (error) {
      console.error('Search error:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  createSnippet(content, query, maxLength = 200) {
    if (!content) return '';

    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryIndex = contentLower.indexOf(queryLower);

    if (queryIndex === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, queryIndex - 50);
    const end = Math.min(content.length, queryIndex + query.length + 50);

    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  // MCP protocol methods
  async handleRequest(request) {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {
                  listChanged: false
                },
                logging: {}
              },
              serverInfo: {
                name: 'vexify-mcp',
                version: require('../../package.json').version
              }
            }
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: [
                {
                  name: 'search_code',
                  description: 'Search through indexed code and documents using semantic search',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'Search query to find relevant code or documents'
                      },
                      top_k: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 5)',
                        default: 5,
                        minimum: 1,
                        maximum: 20
                      },
                      include_content: {
                        type: 'boolean',
                        description: 'Whether to include full content in results (default: true)',
                        default: true
                      }
                    },
                    required: ['query']
                  }
                }
              ]
            }
          };

        case 'tools/call':
          return await this.handleToolCall(params, id);

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          };
      }
    } catch (error) {
      console.error('Request handling error:', error);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      };
    }
  }

  async handleToolCall(params, id) {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case 'search_code':
          const results = await this.search(args.query, {
            topK: args.top_k || 5,
            includeContent: args.include_content !== false
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Found ${results.length} results for "${args.query}":\n\n` +
                    results.map((result, i) =>
                      `${i + 1}. [${result.metadata.language || 'unknown'}] (score: ${result.score.toFixed(4)})\n` +
                      `   File: ${result.metadata.filename || result.id}\n` +
                      `   Snippet: ${result.snippet}\n` +
                      (result.content ? `   Content: ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}\n` : '')
                    ).join('\n')
                }
              ]
            }
          };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Tool execution error: ${error.message}`
        }
      };
    }
  }

  async start() {
    await this.initialize();

    console.error('Vexify MCP Server starting on stdio...');

    let buffer = '';

    process.stdin.on('data', (chunk) => {
      buffer += chunk;

      // Process complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            this.handleRequest(request).then(response => {
              console.log(JSON.stringify(response));
            }).catch(error => {
              console.error('Error handling request:', error);
            });
          } catch (error) {
            console.error('Invalid JSON-RPC request:', line, error);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      console.error('Vexify MCP Server shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('Received SIGINT, shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
      process.exit(0);
    });
  }
}

module.exports = { MCPServer };