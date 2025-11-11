'use strict';

const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');

class VLLMEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName;
    this.host = options.host;
    this.dimension = options.dimension;
    this.detectedHost = null;
  }

  async detectHost() {
    if (this.detectedHost) return this.detectedHost;

    if (await this._tryHost('http://localhost:8000')) {
      this.detectedHost = 'http://localhost:8000';
      return this.detectedHost;
    }

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

    this.detectedHost = 'http://localhost:8000';
    return this.detectedHost;
  }

  async _tryHost(hostUrl) {
    return new Promise((resolve) => {
      const req = http.get(`${hostUrl}/health`, { timeout: 500 }, (res) => {
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
        input: text
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

            // OpenAI-compatible format
            if (response.data && response.data.length > 0 && response.data[0].embedding) {
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
      const url = new URL('/health', effectiveHost);

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
      'intfloat/e5-mistral-7b-instruct': 4096,
      'BAAI/bge-large-en-v1.5': 1024,
      'BAAI/bge-base-en-v1.5': 768,
      'BAAI/bge-small-en-v1.5': 384,
      'thenlper/gte-large': 1024,
      'thenlper/gte-base': 768,
      'sentence-transformers/all-MiniLM-L6-v2': 384,
      'nomic-ai/nomic-embed-text-v1': 768,
      'nomic-ai/nomic-embed-text-v1.5': 768
    };
    return this.dimension || dimensions[this.modelName] || 768;
  }
}

module.exports = { VLLMEmbedder };
