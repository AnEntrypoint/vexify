'use strict';

const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');

class OllamaEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName;
    this.host = options.host;
    this.dimension = options.dimension;
    this.detectedHost = null;
  }

  async detectHost() {
    if (this.detectedHost) return this.detectedHost;

    if (await this._tryHost('http://localhost:11434')) {
      this.detectedHost = 'http://localhost:11434';
      return this.detectedHost;
    }

    if (process.platform === 'linux' && os.release().toLowerCase().includes('microsoft')) {
      try {
        const wslHost = execSync("ip route show | grep -i default | awk '{ print $3}'", { encoding: 'utf8' }).trim();
        const windowsHost = `http://${wslHost}:11434`;
        if (await this._tryHost(windowsHost)) {
          this.detectedHost = windowsHost;
          return this.detectedHost;
        }
      } catch {}
    }

    this.detectedHost = 'http://localhost:11434';
    return this.detectedHost;
  }

  async _tryHost(hostUrl) {
    return new Promise((resolve) => {
      const req = http.get(`${hostUrl}/api/version`, { timeout: 500 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  async embed(text, retries = 3) {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    const effectiveHost = await this.detectHost();
    const originalHost = this.host;
    this.host = effectiveHost;

    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          return await this._embedOnce(text);
        } catch (error) {
          if (error.message.includes('not found') && !this._modelPullAttempted) {
            this._modelPullAttempted = true;
            console.error(`Model ${this.modelName} not found, attempting to pull...`);
            try {
              await this._pullModel();
              return await this._embedOnce(text);
            } catch (pullError) {
              throw new Error(`Failed to auto-pull model: ${pullError.message}`);
            }
          }

          if (attempt === retries - 1) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    } finally {
      this.host = originalHost;
    }
  }

  async _pullModel() {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/pull', this.host);
      const data = JSON.stringify({ model: this.modelName, stream: false });

      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 600000
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.error(`✓ Model ${this.modelName} pulled successfully`);
            resolve();
          } else {
            reject(new Error(`Pull failed with status ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Model pull timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  async _embedOnce(text) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.modelName,
        input: text
      });

      const url = new URL('/api/embed', this.host);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 300000
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            if (response.embeddings && response.embeddings.length > 0) {
              const embedding = response.embeddings[0];
              if (this.dimension && embedding.length > this.dimension) {
                resolve(embedding.slice(0, this.dimension));
              } else {
                resolve(embedding);
              }
            } else if (response.embedding) {
              const embedding = response.embedding;
              if (this.dimension && embedding.length > this.dimension) {
                resolve(embedding.slice(0, this.dimension));
              } else {
                resolve(embedding);
              }
            } else if (response.error) {
              reject(new Error(`Ollama error: ${response.error}`));
            } else {
              reject(new Error(`No embedding in response. Response: ${responseData.substring(0, 200)}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}. Data: ${responseData.substring(0, 200)}`));
          }
        });

        res.on('error', (error) => {
          reject(new Error(`Response stream error: ${error.message}`));
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout after 300s'));
      });

      req.write(data);
      req.end();
    });
  }

  async checkConnection() {
    const effectiveHost = await this.detectHost();

    return new Promise((resolve) => {
      const url = new URL('/api/tags', effectiveHost);

      const req = http.get(url, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  getDimension() {
    const dimensions = {
      'all-minilm': 384,
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'snowflake-arctic-embed': 1024,
      'embeddinggemma': 768,
      'jina-embeddings-v2-base-code': 768,
      'jina-embeddings-v2-base-code:latest': 768
    };
    return this.dimension || dimensions[this.modelName] || 768;
  }
}

module.exports = { OllamaEmbedder };
