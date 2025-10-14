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

    // Intelligent model selection based on project type
    if (options.modelName) {
      this.modelName = options.modelName;
    } else {
      this.modelName = this.detectOptimalModel();
    }

    this.vecStore = null;
    this.lastSyncTime = null;
  }

  detectOptimalModel() {
    // Check if this is a code repository
    const isCodeRepo = this.isDirectoryCodeRepository(this.directory);

    if (isCodeRepo) {
      // Use Jina code embeddings for code repositories
      return 'unclemusclez/jina-embeddings-v2-base-code';
    } else {
      // Use Gemma for documents and general text
      return 'embeddinggemma';
    }
  }

  async initialize() {
    const config = getConfig({
      dbPath: this.dbPath,
      modelName: this.modelName
    });

    this.vecStore = await VecStoreFactory.create(config);
    console.error(`Vexify MCP Server initialized - instant search ready (model: ${this.modelName})`);

    // Initialize optimization flags
    this.indexingPromise = null;
    this.indexingCompleted = false;
    this.lastFileCheck = 0;
    this.fileCheckInterval = 60000; // 60 seconds (reduced frequency)
    this.knownFiles = new Map(); // Use Map to store file paths + mtime + size
    this.fileCache = new Map(); // Cache for file content checksums
    this.lastFullSync = 0;
    this.fullSyncInterval = 300000; // 5 minutes minimum between full syncs

    // Start background indexing immediately if needed
    const stats = await this.getDatabaseStats();
    if (stats.totalDocuments === 0) {
      setTimeout(() => this.startBackgroundIndexing(), 100);
    } else {
      console.error(`Database already has ${stats.totalDocuments} documents - skipping initial indexing`);
      this.indexingCompleted = true;
    }

    // Start lightweight file monitoring
    setTimeout(() => this.startFileMonitoring(), 5000);
  }

  async startBackgroundIndexing() {
    if (this.indexingPromise) return;

    console.error('Starting background indexing...');

    this.indexingPromise = this.performBackgroundSync();

    try {
      await this.indexingPromise;
      this.indexingCompleted = true;
      console.error('✓ Background indexing complete');
    } catch (error) {
      console.error('Background indexing failed:', error.message);
    }
  }

  async performBackgroundSync() {
    try {
      if (!fs.existsSync(this.directory)) {
        throw new Error(`Directory not found: ${this.directory}`);
      }

      // Check if it's a code repository or document folder
      const isCodeRepo = this.isDirectoryCodeRepository(this.directory);

      if (isCodeRepo) {
        await this.syncCodeRepositoryGracefully();
      } else {
        await this.syncDocumentFolderGracefully();
      }

      // Ensure buffer is flushed
      if (this.vecStore.flushBuffer) {
        await this.vecStore.flushBuffer();
      }

    } catch (error) {
      console.error('Background sync error:', error.message);
      // Don't throw - just log and continue
    }
  }

  async syncCodeRepositoryGracefully() {
    const crawler = new CodeCrawler({
      rootPath: this.directory,
      maxDepth: 10,
      maxFileSize: 1024 * 1024, // 1MB
      includeBinary: false,
      customIgnorePatterns: [
      '.git', '.svn', '.hg', '.bzr', '.cvs',
      'node_modules', '.pnpm-store', 'vendor', 'bower_components', '.jspm',
      '.gradle', '.mvn', 'target', 'build', 'out', 'dist', '.cargo',
      '.cache', '.tmp', 'tmp', 'temp', '.temp', 'cache',
      '.next', '.nuxt', '.parcel-cache', '.vite', '.angular', '.svelte-kit',
      '.vscode', '.idea', '.vim', '.emacs.d', '.emacs', 'tags',
      '.DS_Store', 'Thumbs.db', '.Spotlight-V100', '.Trashes',
      'coverage', '.nyc_output', 'test-results', 'junit.xml',
      '.pytest_cache', '.hypothesis', 'htmlcov',
      '_build', '_site', 'site', '.jekyll', '.vuepress/dist',
      'logs', '*.log', '.log', 'npm-debug.log*', 'yarn-debug.log*',
      '.claude', '.claude-context', '.claude-flow', '.sequential-thoughts',
      'glootie', '.mcp-metadata', '.transformers-cache',
      '.env*', 'config.local.json', '.config/local.json',
      '__pycache__', '*.py[cod]', '*$py.class', '.eggs', '*.egg-info',
      'ios/build', 'android/build', 'build/android', 'build/ios'
    ]
    });

    let indexed = { added: 0, skipped: 0, errors: 0 };

    const onPageCrawled = async (doc) => {
      try {
        const result = await this.vecStore.addDocument(doc.id, doc.content, doc.metadata);
        if (result.skipped) {
          indexed.skipped++;
        } else {
          indexed.added++;
        }
      } catch (error) {
        indexed.errors++;
        // Silently skip files with embedding errors
      }
    };

    await crawler.crawl(this.vecStore, onPageCrawled);

    console.error(`Code sync: ${indexed.added} files indexed, ${indexed.skipped} skipped, ${indexed.errors} errors`);
  }

  async syncDocumentFolderGracefully() {
    const folderSync = new FolderSync(this.vecStore, {
      modelName: this.modelName,
      recursive: true
    });

    // Override the individual document processing to handle embedding errors gracefully
    const originalProcessFile = folderSync.processFile.bind(folderSync);
    folderSync.processFile = async function(...args) {
      try {
        return await originalProcessFile(...args);
      } catch (error) {
        console.error(`Skipping file due to error: ${error.message}`);
        return null;
      }
    };

    const results = await folderSync.sync(this.directory);
    console.error(`Document sync: ${results.added} files added, ${results.skipped} skipped`);
  }

  async startFileMonitoring() {
    // Initial file scan
    await this.updateKnownFiles();

    // Set up periodic file monitoring
    setInterval(async () => {
      const hasChanges = await this.checkForFileChanges();
      if (hasChanges) {
        console.error('File changes detected, triggering quick sync...');
        this.performQuickSync();
      }
    }, this.fileCheckInterval);
  }

  async updateKnownFiles() {
    try {
      const files = await this.getAllSourceFiles();
      this.knownFiles.clear();

      // Store file path + mtime + size as a unique key
      files.forEach(file => {
        const key = `${file.path}:${file.mtime}:${file.size}`;
        this.knownFiles.set(file.path, { mtime: file.mtime, size: file.size });
      });

      this.lastFileCheck = Date.now();
    } catch (error) {
      console.error('Error updating known files:', error.message);
    }
  }

  async getAllSourceFiles() {
    const { processors } = require('../processors');
    const supportedExtensions = processors.getAllExtensions();
    const sourceFiles = [];

    const scanDirectory = (dirPath, depth = 0) => {
      if (depth > 10) return; // Prevent infinite recursion

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            // Comprehensive ignore patterns for all platforms and frameworks
            const ignoreDirs = [
              // Version control
              '.git', '.svn', '.hg', '.bzr', '.cvs',

              // Dependencies and package managers
              'node_modules', '.pnpm-store', 'vendor', 'bower_components', '.jspm',
              '.gradle', '.mvn', 'target', 'build', 'out', 'dist',
              '.cargo', 'vendor/bundle', '.bundle',

              // Build artifacts and cache
              '.cache', '.tmp', 'tmp', 'temp', '.temp', 'cache',
              '.next', '.nuxt', '.parcel-cache', '.vite',
              '.angular', '.svelte-kit', '.storybook-out',

              // IDE and editor files
              '.vscode', '.idea', '.vim', '.emacs.d', '.emacs',
              'tags', '.ctags', '.cscope',

              // OS files
              '.DS_Store', 'Thumbs.db', '.Spotlight-V100', '.Trashes',
              '.localized', '.com.apple.timemachine.donotpresent',

              // Testing and coverage
              'coverage', '.nyc_output', 'test-results', 'junit.xml',
              '.pytest_cache', '.hypothesis', 'htmlcov',

              // Documentation builds
              '_build', '_site', 'site', '.jekyll', '.vuepress/dist',
              '.docusaurus', 'docs/_build', '.hugo_build.lock',

              // Logs and debugging
              'logs', '*.log', '.log', 'npm-debug.log*', 'yarn-debug.log*',
              'pm2-logs', 'supervisor-logs',

              // Database files
              '*.db', '*.sqlite', '*.sqlite3', '*.mdb', '*.ldb',

              // Claude and AI related
              '.claude', '.claude-context', '.claude-flow', '.sequential-thoughts',
              'glootie', '.mcp-metadata', '.transformers-cache',

              // Environment and config
              '.env*', 'config.local.json', '.config/local.json',

              // Docker and deployment
              'docker-compose*.yml', 'docker-compose*.yaml', 'k8s', 'kubernetes',

              // Large binaries and archives
              '*.zip', '*.tar.gz', '*.tgz', '*.rar', '*.7z', '*.iso',
              '*.dmg', '*.img', '*.jar', '*.war', '*.ear',

              // Media files
              '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.tiff',
              '*.svg', '*.mp4', '*.avi', '*.mov', '*.mp3', '*.wav',

              // Fonts and certificates
              '*.ttf', '*.otf', '*.woff', '*.woff2', '*.pem', '*.key',

              // Rust specific
              'target', '**/*.rs.bk',

              // Python specific
              '__pycache__', '*.py[cod]', '*$py.class', 'build', 'dist',
              '.eggs', '*.egg-info', '.tox', '.coverage',

              // Go specific
              'vendor',

              // Mobile development
              'ios/build', 'android/build', 'build/android',
              'build/ios', 'platforms', 'plugins',

              // Framework specific
              '.firebase', '.netlify', '.vercel', '.next',
              '.angular', '.nuxt', '.gatsbypagecache'
            ];

            if (!ignoreDirs.includes(entry.name)) {
              scanDirectory(fullPath, depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExtensions.includes(ext)) {
              try {
                const stats = fs.statSync(fullPath);
                sourceFiles.push({
                  path: fullPath,
                  mtime: stats.mtime.getTime(),
                  size: stats.size
                });
              } catch (error) {
                // Skip files we can't read
              }
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    scanDirectory(this.directory);
    return sourceFiles;
  }

  async checkForFileChanges() {
    try {
      const now = Date.now();

      // Prevent too frequent full syncs
      if (now - this.lastFullSync < this.fullSyncInterval) {
        return false;
      }

      const currentFiles = await this.getAllSourceFiles();
      let hasChanges = false;
      let changedFiles = [];

      // Check for new or modified files (conservative check)
      for (const file of currentFiles) {
        const knownFile = this.knownFiles.get(file.path);

        if (!knownFile) {
          // New file
          changedFiles.push(file.path);
          hasChanges = true;
        } else if (knownFile.mtime !== file.mtime || knownFile.size !== file.size) {
          // Modified file (both mtime and size must match to consider unchanged)
          changedFiles.push(file.path);
          hasChanges = true;
        }
      }

      // Check for deleted files (but be less aggressive)
      const currentPaths = new Set(currentFiles.map(f => f.path));
      let deletedCount = 0;
      for (const knownPath of this.knownFiles.keys()) {
        if (!currentPaths.has(knownPath)) {
          deletedCount++;
          // Only trigger reindex if more than 5 files were deleted
          if (deletedCount > 5) {
            hasChanges = true;
            break;
          }
        }
      }

      if (hasChanges && changedFiles.length > 0) {
        console.error(`Detected ${changedFiles.length} file changes: ${changedFiles.slice(0, 3).join(', ')}${changedFiles.length > 3 ? '...' : ''}`);
        this.lastFullSync = now;
      }

      return hasChanges;
    } catch (error) {
      console.error('Error checking file changes:', error.message);
      return false;
    }
  }

  async performQuickSync() {
    // Only sync changed files, not full directory
    try {
      await this.updateKnownFiles();
      // In a full implementation, we'd track specific file changes
      // For now, just trigger a light background sync
      if (!this.indexingPromise) {
        setTimeout(() => this.startBackgroundIndexing(), 100);
      }
    } catch (error) {
      console.error('Quick sync error:', error.message);
    }
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
      // ULTRA-FAST SEARCH: Never trigger indexing during search
      const startTime = Date.now();

      // NEVER trigger indexing during search - only search what's already indexed
      // This ensures consistent performance and no unexpected reindexing
      const results = await this.vecStore.query(query, topK);
      const searchTime = Date.now() - startTime;

      // Log performance metrics only for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error(`Search completed in ${searchTime}ms (${results.length} results)`);
      }

      // Prioritize source code files over documents
      const prioritizedResults = this.prioritizeSourceFiles(results);

      return prioritizedResults.map(result => ({
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

  prioritizeSourceFiles(results) {
    // Sort results: source code files first, then documents
    const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.r', '.m', '.sh', '.sql', '.html', '.css', '.scss', '.less', '.vue', '.svelte'];

    return results.sort((a, b) => {
      const aIsSource = sourceExtensions.some(ext =>
        a.metadata.filename && a.metadata.filename.toLowerCase().endsWith(ext)
      );
      const bIsSource = sourceExtensions.some(ext =>
        b.metadata.filename && b.metadata.filename.toLowerCase().endsWith(ext)
      );

      // Source files first, then by score
      if (aIsSource && !bIsSource) return -1;
      if (!aIsSource && bIsSource) return 1;
      return b.score - a.score; // Higher scores first
    });
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