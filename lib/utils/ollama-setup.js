'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

class OllamaSetup {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.ollamaPath = this.getOllamaPath();
  }

  getOllamaPath() {
    const paths = {
      win32: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      darwin: '/usr/local/bin/ollama',
      linux: '/usr/local/bin/ollama'
    };
    return paths[this.platform] || '/usr/local/bin/ollama';
  }

  async checkOllamaInstalled() {
    try {
      execSync('ollama --version', { stdio: 'ignore' });
      return true;
    } catch {
      return fs.existsSync(this.ollamaPath);
    }
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
    console.log('📦 Installing Ollama...');

    if (this.platform === 'linux') {
      return this.installOllamaLinux();
    } else if (this.platform === 'darwin') {
      return this.installOllamaMac();
    } else if (this.platform === 'win32') {
      return this.installOllamaWindows();
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async installOllamaLinux() {
    try {
      console.log('Running Ollama install script for Linux...');
      execSync('curl -fsSL https://ollama.com/install.sh | sh', {
        stdio: 'inherit',
        shell: '/bin/bash'
      });
      console.log('✓ Ollama installed successfully');
      return true;
    } catch (error) {
      throw new Error(`Failed to install Ollama on Linux: ${error.message}`);
    }
  }

  async installOllamaMac() {
    console.log('Please install Ollama manually:');
    console.log('  1. Visit https://ollama.com/download');
    console.log('  2. Download Ollama for macOS');
    console.log('  3. Install the .dmg file');
    console.log('  4. Run "ollama serve" in a terminal');
    throw new Error('Manual installation required for macOS');
  }

  async installOllamaWindows() {
    console.log('Please install Ollama manually:');
    console.log('  1. Visit https://ollama.com/download');
    console.log('  2. Download Ollama for Windows');
    console.log('  3. Run the installer');
    console.log('  4. Ollama will start automatically');
    throw new Error('Manual installation required for Windows');
  }

  async startOllama() {
    console.log('🚀 Starting Ollama service...');

    return new Promise((resolve, reject) => {
      const ollamaCmd = this.platform === 'win32' ? 'ollama.exe' : 'ollama';

      const proc = spawn(ollamaCmd, ['serve'], {
        detached: true,
        stdio: 'ignore'
      });

      proc.unref();

      setTimeout(async () => {
        const running = await this.checkOllamaRunning();
        if (running) {
          console.log('✓ Ollama service started');
          resolve(true);
        } else {
          reject(new Error('Ollama service failed to start'));
        }
      }, 2000);
    });
  }

  async pullModel(modelName) {
    console.log(`📥 Pulling model: ${modelName}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn('ollama', ['pull', modelName], {
        stdio: 'inherit'
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`✓ Model ${modelName} ready`);
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

  async ensureOllamaReady(modelName = 'all-minilm') {
    const running = await this.checkOllamaRunning();
    if (running) {
      console.log('✓ Ollama is already running');
      return true;
    }

    const installed = await this.checkOllamaInstalled();
    if (!installed) {
      await this.installOllama();
    }

    await this.startOllama();

    console.log(`Checking if model ${modelName} is available...`);
    try {
      execSync(`ollama list | grep ${modelName}`, { stdio: 'ignore' });
      console.log(`✓ Model ${modelName} already available`);
    } catch {
      await this.pullModel(modelName);
    }

    return true;
  }
}

module.exports = { OllamaSetup };
