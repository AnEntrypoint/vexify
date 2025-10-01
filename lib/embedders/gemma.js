'use strict';

class GemmaEmbedder {
  constructor(options = {}) {
    this.modelName = options.modelName || 'onnx-community/embeddinggemma-300m-ONNX';
    this.quantized = options.quantized !== false;
    this.dimension = options.dimension || 768;
    this.model = null;
    this.tokenizer = null;
    this.prefixes = {
      query: 'task: search result | query: ',
      document: 'title: none | text: '
    };
  }

  async loadModel() {
    if (this.model && this.tokenizer) return;

    const { AutoModel, AutoTokenizer } = require('@xenova/transformers');

    console.log(`Loading EmbeddingGemma model: ${this.modelName}`);
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
    this.model = await AutoModel.from_pretrained(this.modelName, {
      quantized: this.quantized
    });
    console.log('Model loaded successfully:', this.modelName);
  }

  async embed(text) {
    await this.loadModel();

    const prefixedText = this.prefixes.document + text;
    const inputs = await this.tokenizer(prefixedText, { padding: true, truncation: true });
    const outputs = await this.model(inputs);

    let embedding;
    if (outputs.sentence_embedding) {
      embedding = Array.from(outputs.sentence_embedding.data);
    } else if (outputs.last_hidden_state) {
      const lastHidden = outputs.last_hidden_state;
      const seqLen = lastHidden.dims[1];
      const hiddenSize = lastHidden.dims[2];
      const pooled = new Float32Array(hiddenSize);

      for (let i = 0; i < hiddenSize; i++) {
        let sum = 0;
        for (let j = 0; j < seqLen; j++) {
          sum += lastHidden.data[j * hiddenSize + i];
        }
        pooled[i] = sum / seqLen;
      }
      embedding = Array.from(pooled);
    } else {
      throw new Error('Unknown output format from model');
    }

    if (this.dimension < 768) {
      return embedding.slice(0, this.dimension);
    }

    return embedding;
  }

  getDimension() {
    return this.dimension;
  }
}

module.exports = { GemmaEmbedder };
