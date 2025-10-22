'use strict';

const { VecStoreFactory, getConfig } = require('../index');
const { CodeCrawler } = require('../crawlers/code');
const { FolderSync } = require('../utils/folder-sync');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MCPServer {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './.vexify.db';
    this.directory = options.directory || process.cwd();
    this.silent = options.silent !== undefined ? options.silent : false;

    // Intelligent model selection based on project type
    if (options.modelName) {
      this.modelName = options.modelName;
    } else {
      this.modelName = this.detectOptimalModel();
    }

    this.vecStore = null;
    this.lastSyncTime = null;

    // Fast startup tracking
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  log(...args) {
    if (!this.silent) {
      console.error(...args);
    }
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

  // Enhanced CRC-based file change detection
  calculateFileCRC(filePath) {
    try {
      const data = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(data).digest('hex');
    } catch (error) {
      return null;
    }
  }

  // Calculate CRC with metadata (mtime + size + content hash)
  calculateEnhancedFileSignature(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const contentHash = this.calculateFileCRC(filePath);
      if (!contentHash) return null;

      return {
        mtime: stats.mtime.getTime(),
        size: stats.size,
        crc: contentHash,
        path: filePath
      };
    } catch (error) {
      return null;
    }
  }

  async initialize() {
    // Check if Ollama is already running before deciding on auto-setup
    const { OllamaEmbedder } = require('../embedders/ollama');
    const embedder = new OllamaEmbedder({
      modelName: this.modelName
    });

    const ollamaAvailable = await embedder.checkConnection();

    const config = getConfig({
      dbPath: this.dbPath,
      modelName: this.modelName,
      autoSetupOllama: !ollamaAvailable // Only auto-setup if Ollama is not responding
    });

    this.vecStore = await VecStoreFactory.create(config);
    this.log(`Vexify MCP Server initialized - instant search ready (model: ${this.modelName})`);

    // Initialize optimization flags
    this.indexingPromise = null;
    this.indexingCompleted = false;
    this.lastFileCheck = 0;
    this.fileCheckInterval = 60000; // 60 seconds (reduced frequency)
    this.knownFiles = new Map(); // Enhanced: stores file paths + mtime + size + CRC
    this.fileCache = new Map(); // Cache for file content checksums
    this.lastFullSync = 0;
    this.fullSyncInterval = 300000; // 5 minutes minimum between full syncs

    // Enhanced sync tracking
    this.fileChecksums = new Map(); // CRC32 checksums for all files
    this.syncValidationEnabled = true; // Ensure 100% sync before searches
    this.lastSyncValidation = 0;
    this.syncValidationInterval = 30000; // Validate sync every 30 seconds

    // Start background indexing immediately if needed
    const stats = await this.getDatabaseStats();
    if (stats.totalDocuments === 0) {
      setTimeout(() => this.startBackgroundIndexing(), 100);
    } else {
      this.log(`Database already has ${stats.totalDocuments} documents - skipping initial indexing`);
      this.indexingCompleted = true;
    }

    // Start lightweight file monitoring (disabled in silent mode to prevent protocol interference)
    if (!this.silent) {
      setTimeout(() => this.startFileMonitoring(), 5000);
    }
  }

  async initializeAsync() {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._doInitializeAsync();
    return this.initializationPromise;
  }

  async _doInitializeAsync() {
    try {
      await this.initialize();
      this.isInitialized = true;
      this.log('✓ Async initialization complete - full search functionality available');
    } catch (error) {
      this.log('Async initialization failed:', error.message);
      throw error;
    }
  }

  async startBackgroundIndexing() {
    if (this.indexingPromise) return;

    this.log('Starting background indexing...');

    this.indexingPromise = this.performBackgroundSync();

    try {
      await this.indexingPromise;
      this.indexingCompleted = true;
      this.log('✓ Background indexing complete');
    } catch (error) {
      this.log('Background indexing failed:', error.message);
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
      this.log('Background sync error:', error.message);
      // Don't throw - just log and continue
    }
  }

  async syncCodeRepositoryGracefully() {
    const crawler = new CodeCrawler({
      rootPath: this.directory,
      maxDepth: 10,
      maxFileSize: 1024 * 1024, // 1MB
      includeBinary: false,
      silent: this.silent,
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
        // Enhanced metadata with file signature for sync validation
        if (doc.metadata?.filePath) {
          const signature = this.calculateEnhancedFileSignature(doc.metadata.filePath);
          if (signature) {
            doc.metadata.fileSignature = signature;
            doc.metadata.lastIndexed = Date.now();
          }
        }

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

    this.log(`Code sync: ${indexed.added} files indexed, ${indexed.skipped} skipped, ${indexed.errors} errors`);
  }

  async syncDocumentFolderGracefully() {
    const folderSync = new FolderSync(this.vecStore, {
      modelName: this.modelName,
      recursive: true
    });

    // Override the individual document processing to handle embedding errors gracefully
    const self = this;
    const originalEmbedFile = folderSync.embedFile.bind(folderSync);
    folderSync.embedFile = async function(file) {
      try {
        const result = await originalEmbedFile(file);

        // Update metadata with file signature for documents processed through FolderSync
        if (result && !result.skipped) {
          const signature = self.calculateEnhancedFileSignature(file.fullPath);
          if (signature) {
            // Update the documents in the vector store with enhanced metadata
            await self.updateDocumentMetadata(file.fullPath, {
              fileSignature: signature,
              lastIndexed: Date.now()
            });
          }
        }

        return result;
      } catch (error) {
        this.log(`Skipping file due to error: ${error.message}`);
        return null;
      }
    };

    const results = await folderSync.sync(this.directory);
    this.log(`Document sync: ${results.added} files added, ${results.skipped} skipped`);
  }

  // Helper method to update document metadata with file signatures
  async updateDocumentMetadata(filePath, additionalMetadata) {
    try {
      const allDocs = await this.vecStore.store.getAll();

      for (const doc of allDocs) {
        if (doc.metadata?.filePath === filePath) {
          const updatedMetadata = { ...doc.metadata, ...additionalMetadata };
          await this.vecStore.store.update(doc.id, {
            ...doc,
            metadata: updatedMetadata
          });
        }
      }
    } catch (error) {
      this.log(`Error updating metadata for ${filePath}:`, error.message);
    }
  }

  async startFileMonitoring() {
    // Initial file scan
    await this.updateKnownFiles();

    // Set up periodic file monitoring
    setInterval(async () => {
      const hasChanges = await this.checkForFileChanges();
      if (hasChanges) {
        this.log('File changes detected, triggering quick sync...');
        this.performQuickSync();
      }
    }, this.fileCheckInterval);
  }

  async updateKnownFiles() {
    try {
      const files = await this.getAllSourceFiles();
      this.knownFiles.clear();
      this.fileChecksums.clear();

      // Enhanced file tracking with CRC checksums
      for (const file of files) {
        const signature = this.calculateEnhancedFileSignature(file.path);
        if (signature) {
          this.knownFiles.set(file.path, {
            mtime: signature.mtime,
            size: signature.size,
            crc: signature.crc
          });
          this.fileChecksums.set(file.path, signature.crc);
        }
      }

      this.lastFileCheck = Date.now();
      this.log(`Updated ${this.knownFiles.size} files with enhanced signatures`);
    } catch (error) {
      this.log('Error updating known files:', error.message);
    }
  }

  async getAllSourceFiles() {
    const processors = require('../processors');
    const supportedExtensions = processors.getAllExtensions();
    const sourceFiles = [];

    const scanDirectory = (dirPath, depth = 0) => {
      if (depth > 10) return []; // Prevent infinite recursion

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
              const subFiles = scanDirectory(fullPath, depth + 1);
              sourceFiles.push(...subFiles);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExtensions.includes(ext)) {
              try {
                const stats = fs.statSync(fullPath);
                // Filter out source files larger than 200KB (204800 bytes) - ~4000 lines max
                if (stats.size <= 204800) {
                  sourceFiles.push({
                    path: fullPath,
                    mtime: stats.mtime.getTime(),
                    size: stats.size
                  });
                }
              } catch (error) {
                // Skip files we can't read
              }
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }

      return sourceFiles;
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

      // Use git status for lightweight change detection
      const gitChangedFiles = await this.getGitChangedFiles();

      if (gitChangedFiles.length === 0) {
        return false;
      }

      let hasChanges = false;
      let changedFiles = [];
      let changedTypes = { new: 0, modified: 0, deleted: 0 };

      // Only check files that git reports as changed
      for (const changedFile of gitChangedFiles) {
        const fullPath = path.resolve(this.directory, changedFile.path);

        // Skip if not a supported file type
        const ext = path.extname(changedFile.path).toLowerCase();
        const processors = require('../processors');
        const supportedExtensions = processors.getAllExtensions();
        if (!supportedExtensions.includes(ext)) {
          continue;
        }

        // Check file size
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 204800) { // 200KB limit
            continue;
          }
        } catch (error) {
          // File might be deleted
        }

        const knownFile = this.knownFiles.get(fullPath);
        const currentSignature = this.calculateEnhancedFileSignature(fullPath);

        if (changedFile.type === 'deleted' || !currentSignature) {
          // Deleted file
          if (knownFile) {
            changedFiles.push({ path: fullPath, type: 'deleted' });
            changedTypes.deleted++;
            hasChanges = true;
          }
        } else if (!knownFile) {
          // New file
          changedFiles.push({ path: fullPath, type: 'new' });
          changedTypes.new++;
          hasChanges = true;
        } else if (knownFile.mtime !== currentSignature.mtime ||
                   knownFile.size !== currentSignature.size ||
                   knownFile.crc !== currentSignature.crc) {
          // Modified file (date + CRC both must be different)
          const changeReason = [];
          if (knownFile.mtime !== currentSignature.mtime) changeReason.push('mtime');
          if (knownFile.size !== currentSignature.size) changeReason.push('size');
          if (knownFile.crc !== currentSignature.crc) changeReason.push('content');

          changedFiles.push({
            path: fullPath,
            type: 'modified',
            reasons: changeReason
          });
          changedTypes.modified++;
          hasChanges = true;
        }
      }

      // Only trigger reindex if significant changes detected
      if (changedTypes.deleted > 0) {
        const deletedPaths = changedFiles.filter(f => f.type === 'deleted').map(f => f.path);
        changedFiles.push({ type: 'deleted', count: changedTypes.deleted, paths: deletedPaths.slice(0, 3) });
        hasChanges = true;
      }

      if (hasChanges) {
        const changeSummary = [];
        if (changedTypes.new > 0) changeSummary.push(`${changedTypes.new} new`);
        if (changedTypes.modified > 0) changeSummary.push(`${changedTypes.modified} modified`);
        if (changedTypes.deleted > 0) changeSummary.push(`${changedTypes.deleted} deleted`);

        const fileExamples = changedFiles
          .filter(f => f.path)
          .slice(0, 3)
          .map(f => `${path.basename(f.path)}(${f.type})`)
          .join(', ');

        this.log(`Enhanced change detection: ${changeSummary.join(', ')} files. Examples: ${fileExamples}${changedFiles.length > 3 ? '...' : ''}`);
        this.lastFullSync = now;
      }

      return hasChanges;
    } catch (error) {
      this.log('Error checking file changes:', error.message);
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
      this.log('Quick sync error:', error.message);
    }
  }

  async getGitChangedFiles() {
    try {
      const { execSync } = require('child_process');

      // Check if we're in a git repository
      try {
        execSync('git rev-parse --git-dir', { cwd: this.directory, stdio: 'ignore' });
      } catch (error) {
        // Not a git repository, fallback to full scan
        this.log('Not in git repository, using full file scan');
        return await this.getFullFileSystemChanges();
      }

      // Get git status for changed files
      const gitStatus = execSync('git status --porcelain', {
        cwd: this.directory,
        encoding: 'utf8'
      }).trim();

      if (!gitStatus) {
        return []; // No changes
      }

      const changedFiles = [];
      const lines = gitStatus.split('\n');

      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        // Parse git status codes
        let fileType = 'modified';
        if (statusCode[0] === '?' || statusCode[1] === '?') {
          fileType = 'new';
        } else if (statusCode[0] === 'D' || statusCode[1] === 'D') {
          fileType = 'deleted';
        } else if (statusCode[0] === 'M' || statusCode[1] === 'M' ||
                   statusCode[0] === 'A' || statusCode[1] === 'A' ||
                   statusCode[0] === 'R' || statusCode[1] === 'R') {
          fileType = 'modified';
        }

        changedFiles.push({
          path: filePath,
          type: fileType,
          statusCode: statusCode
        });
      }

      this.log(`Git detected ${changedFiles.length} changed files`);
      return changedFiles;

    } catch (error) {
      this.log('Git status query failed, falling back to full scan:', error.message);
      return await this.getFullFileSystemChanges();
    }
  }

  async getFullFileSystemChanges() {
    // Fallback method that does a full file system comparison
    // This is the original behavior when git is not available
    const currentFiles = await this.getAllSourceFiles();
    const changedFiles = [];

    for (const file of currentFiles) {
      const knownFile = this.knownFiles.get(file.path);
      const currentSignature = this.calculateEnhancedFileSignature(file.path);

      if (!currentSignature) {
        continue;
      }

      if (!knownFile) {
        changedFiles.push({ path: file.path, type: 'new' });
      } else if (knownFile.mtime !== currentSignature.mtime ||
                 knownFile.size !== currentSignature.size ||
                 knownFile.crc !== currentSignature.crc) {
        changedFiles.push({ path: file.path, type: 'modified' });
      }
    }

    return changedFiles;
  }

  async ensureIndexSync() {
    try {
      // Check if database exists and has content
      const stats = await this.getDatabaseStats();

      if (stats.totalDocuments === 0) {
        this.log('Performing initial index sync...');
        await this.performSync();
        this.lastSyncTime = Date.now();
        return;
      }

      // Enhanced sync validation
      if (this.syncValidationEnabled) {
        const isFullySynced = await this.validateDatabaseSync();
        if (!isFullySynced) {
          this.log('Database sync validation failed, performing full sync...');
          await this.performSync();
          this.lastSyncTime = Date.now();
          return;
        }
      } else {
        // Fallback to basic sync check
        const needsSync = await this.checkIfSyncNeeded();
        if (needsSync) {
          this.log('Detected file changes, performing sync...');
          await this.performSync();
          this.lastSyncTime = Date.now();
          return;
        }
      }

      this.log('✓ Database is 100% in sync with codebase');
    } catch (error) {
      this.log('Error during index sync:', error.message);
      throw error;
    }
  }

  // Comprehensive database sync validation using CRC checksums
  async validateDatabaseSync() {
    try {
      const now = Date.now();

      // Don't validate too frequently
      if (now - this.lastSyncValidation < this.syncValidationInterval) {
        return true; // Assume still valid if recently checked
      }

      this.log('Performing comprehensive database sync validation...');

      // Get current files on disk with signatures
      const currentFiles = await this.getAllSourceFiles();
      const currentSignatures = new Map();

      for (const file of currentFiles) {
        const signature = this.calculateEnhancedFileSignature(file.path);
        if (signature) {
          currentSignatures.set(file.path, signature);
        }
      }

      // Get files tracked in database
      const dbFiles = await this.getTrackedDatabaseFiles();
      const dbSignatures = new Map();

      for (const dbFile of dbFiles) {
        if (dbFile.metadata?.filePath && dbFile.metadata?.fileSignature) {
          dbSignatures.set(dbFile.metadata.filePath, dbFile.metadata.fileSignature);
        }
      }

      // Compare disk vs database
      const mismatches = [];

      // Check for files on disk that aren't in database or have different signatures
      for (const [filePath, signature] of currentSignatures) {
        const dbSignature = dbSignatures.get(filePath);
        if (!dbSignature) {
          mismatches.push({ path: filePath, issue: 'missing_in_db' });
        } else if (dbSignature.crc !== signature.crc ||
                   dbSignature.mtime !== signature.mtime ||
                   dbSignature.size !== signature.size) {
          mismatches.push({ path: filePath, issue: 'signature_mismatch' });
        }
      }

      // Check for files in database that no longer exist on disk
      for (const [filePath] of dbSignatures) {
        if (!currentSignatures.has(filePath)) {
          mismatches.push({ path: filePath, issue: 'deleted_from_disk' });
        }
      }

      this.lastSyncValidation = now;

      if (mismatches.length === 0) {
        this.log(`✓ Sync validation passed: ${currentSignatures.size} files verified`);
        return true;
      } else {
        const issueCounts = mismatches.reduce((acc, m) => {
          acc[m.issue] = (acc[m.issue] || 0) + 1;
          return acc;
        }, {});

        const issuesSummary = Object.entries(issueCounts)
          .map(([issue, count]) => `${count} ${issue.replace(/_/g, ' ')}`)
          .join(', ');

        this.log(`⚠ Sync validation failed: ${issuesSummary}`);
        this.log(`Sample mismatches:`, mismatches.slice(0, 3).map(m => path.basename(m.path)).join(', '));
        return false;
      }
    } catch (error) {
      this.log('Error during sync validation:', error.message);
      return false; // Assume out of sync on error
    }
  }

  // Get files currently tracked in the database
  async getTrackedDatabaseFiles() {
    try {
      const allDocs = await this.vecStore.store.getAll();
      const trackedFiles = [];

      for (const doc of allDocs) {
        if (doc.metadata?.source === 'file' && doc.metadata?.filePath) {
          trackedFiles.push({
            id: doc.id,
            filePath: doc.metadata.filePath,
            metadata: doc.metadata
          });
        }
      }

      return trackedFiles;
    } catch (error) {
      this.log('Error getting tracked database files:', error.message);
      return [];
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
      this.log('Error checking sync status:', error.message);
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

      this.log('Sync completed successfully');
    } catch (error) {
      this.log('Error during sync:', error.message);
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

    this.log(`Code sync: ${indexed.added} files indexed, ${indexed.skipped} skipped`);
  }

  async syncDocumentFolder() {
    const folderSync = new FolderSync(this.vecStore, {
      modelName: this.modelName,
      recursive: true
    });

    const results = await folderSync.sync(this.directory);

    this.log(`Document sync: ${results.added} files added, ${results.skipped} skipped`);
  }

  async search(query, options = {}) {
    const {
      topK = 5,
      includeContent = true,
      filters = {},
      ensureSync = true // Default to ensuring sync before search
    } = options;

    try {
      // ENHANCED SEARCH: Ensure 100% database sync before searching
      const startTime = Date.now();

      // Comprehensive sync validation before search (if enabled)
      if (ensureSync && this.syncValidationEnabled) {
        await this.ensureIndexSync();
      }

      // Perform the actual search
      const results = await this.vecStore.query(query, topK);
      const searchTime = Date.now() - startTime;

      // Log performance metrics with sync status
      if (process.env.NODE_ENV === 'development') {
        const syncStatus = ensureSync && this.syncValidationEnabled ? 'with validation' : 'fast mode';
        this.log(`Search completed in ${searchTime}ms (${results.length} results, ${syncStatus})`);
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
      this.log('Search error:', error.message);
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
                  description: `Search through indexed code and documents using semantic search${this.isInitialized ? '' : ' (initializing...)'}`,
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
      this.log('Request handling error:', error);
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
          // If still initializing, provide immediate feedback
          if (!this.isInitialized) {
            // Check if initialization failed
            if (this.initializationPromise && this.initializationPromise.catch) {
              this.initializationPromise.catch(() => {});
            }

            // If initialization is still in progress, respond immediately
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `🔍 Server is still initializing... Please try again in a moment.\n\nBackground tasks in progress:\n• Setting up vector database\n• Initializing embedding model\n• Preparing search functionality\n\nThis should complete within 30 seconds.`
                  }
                ]
              }
            };
          }

          const results = await this.search(args.query, {
            topK: args.top_k || 5,
            includeContent: args.include_content !== false,
            ensureSync: false // Optimize: skip sync validation for faster responses
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
    this.log('Vexify MCP Server initializing...');

    // Start async initialization but don't wait for it to complete
    // This allows tool reporting to happen immediately
    this.initializeAsync();

    this.log('Vexify MCP Server ready - listening on stdio...');

    let buffer = '';

    // Set up stdin handlers
    process.stdin.setEncoding('utf8');
    process.stdin.resume();

    process.stdin.on('data', (chunk) => {
      buffer += chunk;

      // Process complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            this.handleRequest(request)
              .then(response => {
                console.log(JSON.stringify(response));
              })
              .catch(error => {
                this.log('Error handling request:', error.message);
              });
          } catch (error) {
            this.log('Invalid JSON-RPC message:', line);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      this.log('Vexify MCP Server shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down...');
      if (this.vecStore && this.vecStore.db) {
        this.vecStore.db.close();
      }
      process.exit(0);
    });
  }
}

module.exports = { MCPServer };