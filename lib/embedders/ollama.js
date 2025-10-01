'use strict';

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

class OllamaEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName || 'all-minilm';
    this.host = options.host || 'http://localhost:11434';
    this.dimension = options.dimension || null;
  }

  async embed(text) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.modelName,
        prompt: text
      });

      const url = new URL('/api/embeddings', this.host);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
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
            if (response.embedding) {
              const embedding = response.embedding;
              if (this.dimension && embedding.length > this.dimension) {
                resolve(embedding.slice(0, this.dimension));
              } else {
                resolve(embedding);
              }
            } else {
              reject(new Error('No embedding in response'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama request failed: ${error.message}. Is Ollama running?`));
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
