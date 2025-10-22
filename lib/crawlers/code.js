'use strict';

const fs = require('fs');
const path = require('path');
const { IgnoreManager } = require('../utils/ignore-manager');

class CodeCrawler {
  constructor(options = {}) {
    this.rootPath = options.rootPath || process.cwd();
    this.maxDepth = options.maxDepth || 10;
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default
    this.includeBinary = options.includeBinary || false;
    this.customIgnorePatterns = options.customIgnorePatterns || [];
    this.silent = options.silent || false;
    this.supportedLanguages = this.getSupportedLanguages();
    this.visitedFiles = new Set();
    this.stats = {
      totalFiles: 0,
      indexedFiles: 0,
      skippedFiles: 0,
      errors: 0,
      languages: {},
      totalSize: 0
    };
  }

  log(...args) {
    if (!this.silent) {
      console.error(...args);
    }
  }

  getSupportedLanguages() {
    return {
      // Web Technologies
      javascript: { extensions: ['.js', '.jsx', '.mjs', '.cjs'], syntax: 'javascript' },
      typescript: { extensions: ['.ts', '.tsx'], syntax: 'typescript' },
      html: { extensions: ['.html', '.htm'], syntax: 'html' },
      css: { extensions: ['.css', '.scss', '.sass', '.less'], syntax: 'css' },
      vue: { extensions: ['.vue'], syntax: 'vue' },
      svelte: { extensions: ['.svelte'], syntax: 'svelte' },

      // Python
      python: { extensions: ['.py', '.pyw', '.pyi'], syntax: 'python' },

      // Java
      java: { extensions: ['.java', '.class', '.jar'], syntax: 'java' },

      // C/C++
      c: { extensions: ['.c', '.h'], syntax: 'c' },
      cpp: { extensions: ['.cpp', '.cxx', '.cc', '.hpp', '.hxx', '.hh'], syntax: 'cpp' },
      csharp: { extensions: ['.cs'], syntax: 'csharp' },

      // Go
      go: { extensions: ['.go'], syntax: 'go' },

      // Rust
      rust: { extensions: ['.rs'], syntax: 'rust' },

      // PHP
      php: { extensions: ['.php', '.phtml', '.php3', '.php4', '.php5'], syntax: 'php' },

      // Ruby
      ruby: { extensions: ['.rb', '.rbw'], syntax: 'ruby' },

      // Swift
      swift: { extensions: ['.swift'], syntax: 'swift' },

      // Kotlin
      kotlin: { extensions: ['.kt', '.kts'], syntax: 'kotlin' },

      // Scala
      scala: { extensions: ['.scala', '.sc'], syntax: 'scala' },

      // C#
      csharp: { extensions: ['.cs'], syntax: 'csharp' },

      // Dart
      dart: { extensions: ['.dart'], syntax: 'dart' },

      // Shell scripts
      bash: { extensions: ['.sh', '.bash', '.zsh', '.fish'], syntax: 'bash' },
      powershell: { extensions: ['.ps1', '.psm1', '.psd1'], syntax: 'powershell' },

      // Configuration files
      json: { extensions: ['.json'], syntax: 'json' },
      yaml: { extensions: ['.yaml', '.yml'], syntax: 'yaml' },
      toml: { extensions: ['.toml'], syntax: 'toml' },
      xml: { extensions: ['.xml'], syntax: 'xml' },

      // Documentation
      markdown: { extensions: ['.md', '.markdown'], syntax: 'markdown' },
      tex: { extensions: ['.tex', '.latex'], syntax: 'latex' },

      // SQL
      sql: { extensions: ['.sql'], syntax: 'sql' },

      // Docker
      dockerfile: { files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'], syntax: 'docker' },

      // Kubernetes
      kubernetes: { extensions: ['.yaml', '.yml'], patterns: ['**/k8s/**', '**/kubernetes/**'], syntax: 'yaml' },

      // CI/CD
      github: { files: ['.github/workflows/*.yml', '.github/workflows/*.yaml'], syntax: 'yaml' },
      gitlab: { files: ['.gitlab-ci.yml'], syntax: 'yaml' },

      // Package managers
      npm: { files: ['package.json', 'package-lock.json'], syntax: 'json' },
      pip: { files: ['requirements.txt', 'setup.py', 'pyproject.toml'], syntax: 'text' },
      cargo: { files: ['Cargo.toml', 'Cargo.lock'], syntax: 'toml' },
      maven: { files: ['pom.xml'], syntax: 'xml' },
      gradle: { files: ['build.gradle', 'settings.gradle'], syntax: 'groovy' },

      // Configuration
      env: { files: ['.env*', '.env.example'], syntax: 'bash' },
      editor: { files: ['.editorconfig', '.eslintrc.*', '.prettierrc.*'], syntax: 'text' },

      // Makefiles
      make: { files: ['Makefile', 'makefile', '*.mk'], syntax: 'makefile' },

      // Other
      text: { extensions: ['.txt', '.rst', '.adoc'], syntax: 'text' },
      config: { extensions: ['.conf', '.cfg', '.ini', '.properties'], syntax: 'text' }
    };
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const relativePath = path.relative(this.rootPath, filePath);

    for (const [langName, langInfo] of Object.entries(this.supportedLanguages)) {
      // Check by file name first
      if (langInfo.files) {
        for (const file of langInfo.files) {
          if (this.matchesFilePattern(fileName, file) || this.matchesFilePattern(relativePath, file)) {
            return langName;
          }
        }
      }

      // Check by patterns
      if (langInfo.patterns) {
        for (const pattern of langInfo.patterns) {
          if (this.matchesFilePattern(relativePath, pattern)) {
            return langName;
          }
        }
      }

      // Check by extension
      if (langInfo.extensions && langInfo.extensions.includes(ext)) {
        return langName;
      }
    }

    return 'text'; // Default fallback
  }

  matchesFilePattern(filePath, pattern) {
    // Simple glob matching for file patterns
    const regex = new RegExp(
      '^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') + '$'
    );
    return regex.test(filePath);
  }

  isBinaryFile(filePath, buffer) {
    // Check file extension for known binary types
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.svg',
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
      '.mp3', '.wav', '.flac', '.ogg', '.aac',
      '.zip', '.tar', '.gz', '.rar', '.7z', '.iso',
      '.exe', '.dll', '.so', '.dylib',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
    ];

    const ext = path.extname(filePath).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return true;
    }

    // Check file content for binary indicators
    if (buffer && buffer.length > 0) {
      // Check for null bytes (common in binary files)
      if (buffer.includes(0)) {
        return true;
      }

      // Check for UTF-8 validity
      try {
        Buffer.from(buffer).toString('utf8');
      } catch (e) {
        return true;
      }
    }

    return false;
  }

  async processFile(filePath, vecStore, onPageCallback) {
    try {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(this.rootPath, filePath);
      const language = this.detectLanguage(filePath);

      this.stats.totalFiles++;
      this.stats.totalSize += stats.size;

      // Check if file is too large
      if (stats.size > this.maxFileSize) {
        this.stats.skippedFiles++;
        console.error(`  ⚠ Skipping large file: ${relativePath} (${Math.round(stats.size / 1024)}KB)`);
        return null;
      }

      // Read file content
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        // Try reading as buffer first to check if it's binary
        const buffer = fs.readFileSync(filePath);
        if (!this.includeBinary && this.isBinaryFile(filePath, buffer)) {
          this.stats.skippedFiles++;
          return null;
        }
        content = buffer.toString('utf8');
      }

      // Create document metadata
      const document = {
        id: this.generateDocumentId(filePath),
        content: content,
        metadata: {
          source: 'code',
          filePath: relativePath,
          absolutePath: filePath,
          language: language,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          encoding: 'utf8'
        }
      };

      this.stats.indexedFiles++;
      this.stats.languages[language] = (this.stats.languages[language] || 0) + 1;

      this.log(`  ✓ Indexed: ${relativePath} (${language})`);

      return document;

    } catch (error) {
      this.stats.errors++;
      console.error(`  ⚠ Error processing ${filePath}: ${error.message}`);
      return null;
    }
  }

  generateDocumentId(filePath) {
    const relativePath = path.relative(this.rootPath, filePath);
    const hash = require('crypto').createHash('sha256').update(relativePath).digest('hex').substring(0, 16);
    return `code-${hash}`;
  }

  async crawlDirectory(dirPath, vecStore, onPageCallback, depth = 0) {
    if (depth > this.maxDepth) {
      return [];
    }

    const results = [];
    const ignoreManager = new IgnoreManager(this.rootPath, this.customIgnorePatterns);

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Skip if ignored
        if (ignoreManager.shouldIgnore(fullPath)) {
          this.stats.skippedFiles++;
          continue;
        }

        // Skip if already visited
        if (this.visitedFiles.has(fullPath)) {
          continue;
        }
        this.visitedFiles.add(fullPath);

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          const subResults = await this.crawlDirectory(fullPath, vecStore, onPageCallback, depth + 1);
          results.push(...subResults);
        } else if (entry.isFile()) {
          // Process individual file
          const document = await this.processFile(fullPath, vecStore, onPageCallback);
          if (document && onPageCallback) {
            // Fire and forget - don't block crawler waiting for embeddings
            onPageCallback(document).catch(err => {
              console.error(`  ⚠ Callback error for ${document.id}: ${err.message}`);
            });
          }
          results.push(document);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`  ⚠ Error reading directory ${dirPath}: ${error.message}`);
    }

    return results;
  }

  async crawl(vecStore = null, onPageCallback = null) {
    console.error(`\n🔍 Starting code repository crawl: ${this.rootPath}`);
    console.error(`   Max depth: ${this.maxDepth}, Max file size: ${Math.round(this.maxFileSize / 1024)}KB`);

    const ignoreManager = new IgnoreManager(this.rootPath, this.customIgnorePatterns);
    const ignoreStats = ignoreManager.getIgnoreStats();
    console.error(`   Ignore patterns: ${ignoreStats.patterns} loaded`);

    const startTime = Date.now();
    const results = await this.crawlDirectory(this.rootPath, vecStore, onPageCallback);
    const endTime = Date.now();

    // Flush buffer if vecStore is provided
    if (vecStore) {
      await vecStore.flushBuffer();
    }

    console.error(`\n✓ Code repository crawl completed in ${((endTime - startTime) / 1000).toFixed(1)}s:`);
    console.error(`   Total files found: ${this.stats.totalFiles}`);
    console.error(`   Files indexed: ${this.stats.indexedFiles}`);
    console.error(`   Files skipped: ${this.stats.skippedFiles}`);
    console.error(`   Errors: ${this.stats.errors}`);
    console.error(`   Total size: ${Math.round(this.stats.totalSize / 1024)}KB`);

    if (Object.keys(this.stats.languages).length > 0) {
      console.error(`   Languages detected:`);
      Object.entries(this.stats.languages)
        .sort(([,a], [,b]) => b - a)
        .forEach(([lang, count]) => {
          console.error(`     ${lang}: ${count} files`);
        });
    }

    return {
      files: results.filter(r => r !== null),
      stats: this.stats,
      rootPath: this.rootPath
    };
  }
}

module.exports = { CodeCrawler };