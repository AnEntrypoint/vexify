'use strict';

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

class OllamaEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName;
    this.host = options.host;
    this.dimension = options.dimension;
  }

  async embed(text, retries = 3) {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

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
        timeout: 30000
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
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout after 30s'));
      });

      req.write(data);
      req.end();
    });
  }

  async checkConnection() {
    return new Promise((resolve) => {
      const url = new URL('/api/tags', this.host);

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
      'embeddinggemma': 768
    };
    return this.dimension || dimensions[this.modelName] || 768;
  }
}

module.exports = { OllamaEmbedder };
