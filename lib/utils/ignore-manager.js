'use strict';

const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');

class IgnoreManager {
  constructor(rootPath, customPatterns = []) {
    this.rootPath = rootPath;
    this.patterns = new Set();
    this.negatedPatterns = new Set();

    // Load universal defaults
    this.addUniversalDefaults();

    // Add custom patterns
    customPatterns.forEach(pattern => this.addPattern(pattern));

    // Load ignore files from directory structure
    this.loadIgnoreFiles(rootPath);
  }

  addUniversalDefaults() {
    const universalPatterns = [
      // Development and metadata
      '.claude/',
      '.claude-context/',
      'node_modules/',
      'test/',
      '*.log',

      // Cache and build artifacts
      '.transformers-cache/',
      'code_search_index/',
      'glootie/',
      'results/',
      'shell-snapshots/',
      '.mcp-metadata/',

      // Test and analysis files
      'test-*.txt',
      'test-*.cjs',
      'test-*.js',
      '*.test.js',
      '*.spec.js',
      'analyze_step_data.py',
      'analyze_with_bash.sh',
      'analyze-steps.js',
      'claude-output-*.json',
      'claude-output-*.json.*.log',
      'claude-steps-*.json',
      '*.stderr.log',
      '*.stdout.log',
      'mcp-performance-*.json',

      // Git and version control
      '.git/',
      '.gitignore',
      '.gitmodules',
      '.gitattributes',

      // OS files
      '.DS_Store',
      'Thumbs.db',
      'nul',
      '.DS_Store?',
      '._*',
      '.Spotlight-V100',
      '.Trashes',
      'ehthumbs.db',
      'Thumbs.db',

      // Editor and IDE files
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '*~',
      '.#*',
      '#*#',
      '.emacs.desktop*',
      '.emacs.d/',
      '.emacs.d/**/*',
      '.lein*',
      '.lsp-cache/',
      '.project',
      '.settings/',
      '.vimrc',
      'tags',

      // Package managers
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'Poetry.lock',
      'composer.lock',
      'Gemfile.lock',
      'requirements.lock',
      'Pipfile.lock',

      // Build and dist
      'dist/',
      'build/',
      'out/',
      '.next/',
      '.nuxt/',
      '.cache/',
      '.tmp/',
      'tmp/',
      'temp/',

      // Environment and config
      '.env',
      '.env.local',
      '.env.development.local',
      '.env.test.local',
      '.env.production.local',
      'config.local.json',
      '.config/local.json',

      // Logs and debugging
      'logs/',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      'pnpm-debug.log*',
      'lerna-debug.log*',

      // Coverage and testing
      'coverage/',
      '.nyc_output/',
      'junit.xml',
      'test-results/',
      'test-results/**/*',

      // Dependency directories
      'node_modules/',
      '.pnpm-store/',
      'vendor/',
      'bower_components/',
      '.jspm/',

      // Runtime data
      'pids/',
      '*.pid',
      '*.seed',
      '*.pid.lock',
      '.npm',
      '.eslintcache',
      '.stylelintcache',
      '.rpt2_cache/',
      '.rts2_cache_cjs/',
      '.rts2_cache_es/',
      '.rts2_cache_umd/',

      // TypeScript
      '*.tsbuildinfo',

      // Optional npm cache directory
      '.npm',

      // Optional eslint cache
      '.eslintcache',

      // Microbundle cache
      '.rpt2_cache/',
      '.rts2_cache_cjs/',
      '.rts2_cache_es/',
      '.rts2_cache_umd/',

      // Optional REPL history
      '.node_repl_history',

      // Output of 'npm pack'
      '*.tgz',

      // Yarn Integrity file
      '.yarn-integrity',

      // dotenv environment variables file
      '.env',
      '.env.test',

      // parcel-bundler cache (https://parceljs.org/)
      '.cache',
      '.parcel-cache',

      // Next.js build output
      '.next',
      'out',

      // Nuxt.js build / generate output
      '.nuxt',
      'dist',

      // Gatsby files
      '.cache/',
      'public',

      // Storybook build outputs
      '.out',
      '.storybook-out',
      'storybook-static',

      // Temporary folders
      'tmp/',
      'temp/',

      // Editor directories and files
      '.vscode/*',
      '!.vscode/extensions.json',
      '.idea',
      '*.suo',
      '*.ntvs*',
      '*.njsproj',
      '*.sln',
      '*.sw?',

      // OS generated files
      '.DS_Store',
      '.DS_Store?',
      '._*',
      '.Spotlight-V100',
      '.Trashes',
      'ehthumbs.db',
      'Thumbs.db',

      // Rust
      'target/',
      '**/*.rs.bk',
      'Cargo.lock',

      // Python
      '__pycache__/',
      '*.py[cod]',
      '*$py.class',
      '*.so',
      '.Python',
      'build/',
      'develop-eggs/',
      'dist/',
      'downloads/',
      'eggs/',
      '.eggs/',
      'lib/',
      'lib64/',
      'parts/',
      'sdist/',
      'var/',
      'wheels/',
      '*.egg-info/',
      '.installed.cfg',
      '*.egg',
      'MANIFEST',
      'pip-log.txt',
      'pip-delete-this-directory.txt',
      '.tox/',
      '.coverage',
      '.cover',
      '.pytest_cache/',
      'htmlcov/',
      '.hypothesis/',
      '.pytest_cache/',

      // Java
      '*.class',
      '*.jar',
      '*.war',
      '*.ear',
      '*.zip',
      '*.tar.gz',
      '*.rar',
      'target/',
      '.gradle/',
      '.mvn/',
      'build/',
      'out/',

      // Go
      '*.exe',
      '*.exe~',
      '*.dll',
      '*.so',
      '*.dylib',
      '*.test',
      '*.out',
      'vendor/',

      // C/C++
      '*.o',
      '*.obj',
      '*.exe',
      '*.dll',
      '*.lib',
      '*.a',
      '*.so',
      '*.dylib',
      'Debug/',
      'Release/',
      'build/',
      'cmake-build-',

      // Docker and deployment
      'Dockerfile*',
      'docker-compose*',
      '.dockerignore',
      'k8s/',
      'kubernetes/',

      // Database
      '*.db',
      '*.sqlite',
      '*.sqlite3',
      '*.mdb',

      // Large files
      '*.zip',
      '*.tar.gz',
      '*.tgz',
      '*.rar',
      '*.7z',
      '*.iso',
      '*.dmg',
      '*.img',

      // Media files
      '*.jpg',
      '*.jpeg',
      '*.png',
      '*.gif',
      '*.bmp',
      '*.tiff',
      '*.svg',
      '*.mp4',
      '*.avi',
      '*.mov',
      '*.wmv',
      '*.flv',
      '*.webm',
      '*.mp3',
      '*.wav',
      '*.flac',
      '*.ogg',
      '*.aac',

      // Fonts
      '*.ttf',
      '*.otf',
      '*.woff',
      '*.woff2',
      '*.eot',

      // Certificates and keys
      '*.pem',
      '*.key',
      '*.crt',
      '*.p12',
      '*.pfx',
      '*.jks',

      // Backup files
      '*.bak',
      '*.backup',
      '*.old',
      '*.orig',
      '*.rej',
      '*.swp',
      '*.swo',
      '*~',

      // Documentation builds
      '_build/',
      '_site/',
      'site/',
      '.jekyll/',
      '.vuepress/dist/',
      '.docusaurus/',

      // Hugo
      '.hugo_build.lock',
      'public/',
      'resources/_gen/',

      // Jekyll
      '.sass-cache/',
      '.jekyll-cache/',
      '.jekyll-metadata',
      'vendor/bundle/',
      'vendor/cache/',
      'vendor/gems/',
      'vendor/ruby/',
      '.bundle/'
    ];

    universalPatterns.forEach(pattern => {
      if (pattern.startsWith('!')) {
        const negatedPattern = pattern.slice(1);
        this.negatedPatterns.add(negatedPattern);
      } else {
        this.addPattern(pattern);
      }
    });
  }

  loadIgnoreFiles(dirPath, depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion

    try {
      const files = fs.readdirSync(dirPath);

      const ignoreFiles = [
        '.gitignore',
        '.dockerignore',
        '.npmignore',
        '.eslintignore',
        '.prettierignore',
        '.stylelintignore',
        '.git/info/exclude',
        '.ignore'
      ];

      for (const file of files) {
        if (ignoreFiles.includes(file)) {
          const filePath = path.join(dirPath, file);
          this.loadIgnoreFile(filePath, dirPath);
        }
      }

      // Recursively check subdirectories
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && !this.shouldIgnore(fullPath, dirPath)) {
            this.loadIgnoreFiles(fullPath, depth + 1);
          }
        } catch (e) {
          // Skip files we can't read
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }

  loadIgnoreFile(filePath, basePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // Handle negation patterns
        if (trimmed.startsWith('!')) {
          const pattern = trimmed.slice(1);
          const fullPath = path.join(basePath, pattern);
          this.negatedPatterns.add(fullPath);
        } else {
          this.addPattern(trimmed, basePath);
        }
      }
    } catch (e) {
      // Skip files we can't read
    }
  }

  addPattern(pattern, basePath = null) {
    const fullPattern = basePath ? path.join(basePath, pattern) : pattern;

    // Convert to forward slashes for consistency
    const normalizedPattern = fullPattern.replace(/\\/g, '/');

    // Handle directory patterns
    if (normalizedPattern.endsWith('/')) {
      this.patterns.add(normalizedPattern + '**/*');
      this.patterns.add(normalizedPattern.slice(0, -1));
    } else {
      this.patterns.add(normalizedPattern);

      // If pattern doesn't contain a slash, it applies to all directories
      if (!normalizedPattern.includes('/')) {
        this.patterns.add('**/' + normalizedPattern);
      }
    }
  }

  shouldIgnore(filePath, basePath = this.rootPath) {
    const relativePath = path.relative(basePath, filePath);
    const normalizedPath = relativePath.replace(/\\/g, '/');

    // Check negated patterns first (they take precedence)
    for (const negatedPattern of this.negatedPatterns) {
      if (this.matchesPattern(normalizedPath, negatedPattern)) {
        return false;
      }
    }

    // Check ignore patterns
    for (const pattern of this.patterns) {
      if (this.matchesPattern(normalizedPath, pattern)) {
        return true;
      }
    }

    return false;
  }

  matchesPattern(filePath, pattern) {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Handle absolute patterns
    if (normalizedPattern.startsWith('/') || /^[a-zA-Z]:/.test(normalizedPattern)) {
      const patternPath = normalizedPattern.replace(/^[\/\\]/, '');
      return minimatch(normalizedPath, patternPath, { dot: true, matchBase: true });
    }

    // Handle relative patterns
    return minimatch(normalizedPath, normalizedPattern, { dot: true, matchBase: true });
  }

  getIgnoreStats() {
    return {
      patterns: this.patterns.size,
      negatedPatterns: this.negatedPatterns.size,
      total: this.patterns.size + this.negatedPatterns.size
    };
  }
}

module.exports = { IgnoreManager };