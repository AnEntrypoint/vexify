'use strict';

const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');
const { getModelDimension } = require('../config/defaults');

class VLLMEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName;
    this.host = options.host || 'http://localhost:8000';
    this.dimension = options.dimension;
    this.detectedHost = null;
  }

  async detectHost() {
    if (this.detectedHost) return this.detectedHost;

    // Try configured host first
    if (await this._tryHost(this.host)) {
      this.detectedHost = this.host;
      return this.detectedHost;
    }

    // Try default localhost
    if (await this._tryHost('http://localhost:8000')) {
      this.detectedHost = 'http://localhost:8000';
      return this.detectedHost;
    }

    // Try WSL host detection
    if (process.platform === 'linux' && os.release().toLowerCase().includes('microsoft')) {
      try {
        const wslHost = execSync("ip route show | grep -i default | awk '{ print $3}'", { encoding: 'utf8', timeout: 2000 }).trim();
        const windowsHost = `http://${wslHost}:8000`;
        if (await this._tryHost(windowsHost)) {
          this.detectedHost = windowsHost;
          return this.detectedHost;
        }
      } catch {}
    }

    // Fall back to configured host
    this.detectedHost = this.host;
    return this.detectedHost;
  }

  async _tryHost(hostUrl) {
    return new Promise((resolve) => {
      const url = new URL('/v1/models', hostUrl);
      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.get(url, { timeout: 500 }, (res) => {
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

  async _embedOnce(text) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.modelName,
        input: text,
        encoding_format: 'float'
      });

      const url = new URL('/v1/embeddings', this.host);
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
            if (response.data && response.data.length > 0) {
              const embedding = response.data[0].embedding;
              if (this.dimension && embedding.length > this.dimension) {
                resolve(embedding.slice(0, this.dimension));
              } else {
                resolve(embedding);
              }
            } else if (response.error) {
              reject(new Error(`vLLM error: ${JSON.stringify(response.error)}`));
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
        reject(new Error(`vLLM request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('vLLM request timeout after 300s'));
      });

      req.write(data);
      req.end();
    });
  }

  async checkConnection() {
    const effectiveHost = await this.detectHost();

    return new Promise((resolve) => {
      const url = new URL('/v1/models', effectiveHost);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, (res) => {
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
    if (this.dimension) return this.dimension;
    try {
      return getModelDimension(this.modelName);
    } catch (e) {
      console.warn(`Model ${this.modelName} not in registry, defaulting to 768: ${e.message}`);
      return 768;
    }
  }
}

module.exports = { VLLMEmbedder };
