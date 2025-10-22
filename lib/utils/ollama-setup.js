'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

// Lazy-load unzipper to avoid blocking on module import
let unzipper = null;
function getUnzipper() {
  if (!unzipper) {
    unzipper = require('unzipper');
  }
  return unzipper;
}

class OllamaSetup {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.localDir = path.join(__dirname, '..', '..', 'node_modules', '.ollama');
    this.ollamaPath = this.getOllamaPath();
  }

  getOllamaPath() {
    const ollamaBinary = this.platform === 'win32' ? 'ollama.exe' : 'ollama';
    return path.join(this.localDir, 'bin', ollamaBinary);
  }

  async checkOllamaInstalled() {
    return fs.existsSync(this.ollamaPath);
  }

  getDownloadUrl() {
    const archMap = {
      'x64': 'amd64',
      'arm64': 'arm64'
    };
    const ollamaArch = archMap[this.arch] || 'amd64';

    if (this.platform === 'linux') {
      return `https://ollama.com/download/ollama-linux-${ollamaArch}.tgz`;
    } else if (this.platform === 'darwin') {
      return `https://ollama.com/download/Ollama-darwin.zip`;
    } else if (this.platform === 'win32') {
      return `https://ollama.com/download/ollama-windows-${ollamaArch}.zip`;
    }
    throw new Error(`Unsupported platform: ${this.platform}`);
  }

  async downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          return this.downloadFile(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(destPath);
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          if (percent !== lastPercent && percent % 10 === 0) {
            console.error(`  ${percent}% (${Math.floor(downloadedBytes / 1024 / 1024)}MB / ${Math.floor(totalBytes / 1024 / 1024)}MB)`);
            lastPercent = percent;
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.error('  100% Complete');
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', reject);
    });
  }

  async extractTarGz(archivePath, destDir) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(archivePath);
      const gunzip = zlib.createGunzip();

      gunzip.on('error', reject);

      const tar = spawn('tar', ['-xz', '-C', destDir], {
        stdio: ['pipe', 'inherit', 'inherit']
      });

      readStream.pipe(gunzip).pipe(tar.stdin);

      tar.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar extraction failed with code ${code}`));
        }
      });

      tar.on('error', reject);
    });
  }

  async extractZip(archivePath, destDir) {
    return new Promise((resolve, reject) => {
      const Unzipper = getUnzipper();
      fs.createReadStream(archivePath)
        .pipe(Unzipper.Extract({ path: destDir }))
        .on('close', () => resolve())
        .on('error', reject);
    });
  }

  async downloadAndInstallLocal() {
    console.error('📦 Downloading Ollama to local directory...');

    fs.mkdirSync(this.localDir, { recursive: true });

    const downloadUrl = this.getDownloadUrl();
    const archiveName = path.basename(downloadUrl);
    const archivePath = path.join(this.localDir, archiveName);

    console.error(`Downloading from ${downloadUrl}...`);
    await this.downloadFile(downloadUrl, archivePath);

    console.error('Extracting...');
    const binDir = path.join(this.localDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    if (this.platform === 'win32') {
      await this.extractZip(archivePath, this.localDir);
      const ollamaBinary = path.join(binDir, 'ollama.exe');
      if (fs.existsSync(ollamaBinary)) {
        fs.chmodSync(ollamaBinary, 0o755);
      }
    } else {
      await this.extractTarGz(archivePath, this.localDir);
      const ollamaBinary = path.join(binDir, 'ollama');
      if (fs.existsSync(ollamaBinary)) {
        fs.chmodSync(ollamaBinary, 0o755);
      }
    }

    fs.unlinkSync(archivePath);
    console.error('✓ Ollama installed locally');

    this.ollamaPath = this.getOllamaPath();
    return true;
  }

  async checkOllamaRunning() {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:11434/api/tags', (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async installOllama() {
    return this.downloadAndInstallLocal();
  }

  async startOllama() {
    console.error('🚀 Starting Ollama service...');

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ollamaPath, ['serve'], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          OLLAMA_MODELS: path.join(this.localDir, 'models')
        }
      });

      proc.unref();

      setTimeout(async () => {
        const running = await this.checkOllamaRunning();
        if (running) {
          console.error('✓ Ollama service started');
          resolve(true);
        } else {
          reject(new Error('Ollama service failed to start'));
        }
      }, 2000);
    });
  }

  async pullModel(modelName) {
    console.error(`📥 Pulling model: ${modelName}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ollamaPath, ['pull', modelName], {
        stdio: 'inherit',
        env: {
          ...process.env,
          OLLAMA_MODELS: path.join(this.localDir, 'models')
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.error(`✓ Model ${modelName} ready`);
          resolve(true);
        } else {
          reject(new Error(`Failed to pull model ${modelName}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to pull model: ${err.message}`));
      });
    });
  }

  async ensureOllamaReady(modelName = 'embeddinggemma') {
    const running = await this.checkOllamaRunning();
    if (running) {
      console.error('✓ Ollama is already running');
      return true;
    }

    const installed = await this.checkOllamaInstalled();
    if (!installed) {
      await this.installOllama();
    }

    await this.startOllama();

    console.error(`Checking if model ${modelName} is available...`);
    try {
      execSync(`${this.ollamaPath} list | grep ${modelName}`, {
        stdio: 'ignore',
        env: {
          ...process.env,
          OLLAMA_MODELS: path.join(this.localDir, 'models')
        }
      });
      console.error(`✓ Model ${modelName} already available`);
    } catch {
      await this.pullModel(modelName);
    }

    return true;
  }
}

module.exports = { OllamaSetup };
