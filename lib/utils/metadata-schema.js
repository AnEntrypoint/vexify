'use strict';

const METADATA_SCHEMA = {
  required: [],
  optional: [
    'filePath', 'source', 'title', 'format', 'language', 'hash', 'checksum',
    'lastIndexed', 'fileSignature', 'keywords', 'type', 'length', 'crawlUrl',
    'fileName', 'contentHash', 'pageNumber', 'itemIndex', 'itemData', 'processedAt'
  ],
  types: {
    filePath: 'string',
    source: 'string',
    title: 'string',
    format: 'string',
    language: 'string',
    hash: 'string',
    checksum: 'string',
    lastIndexed: 'number',
    fileSignature: 'object',
    keywords: 'array',
    type: 'string',
    length: 'number',
    crawlUrl: 'string',
    fileName: 'string',
    contentHash: 'string',
    pageNumber: 'number',
    itemIndex: 'number',
    itemData: 'object',
    processedAt: 'string'
  }
};

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Metadata must be an object');
  }

  const allowed = new Set([...METADATA_SCHEMA.required, ...METADATA_SCHEMA.optional]);

  for (const key of Object.keys(metadata)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown metadata field: ${key}. Allowed: ${Array.from(allowed).join(', ')}`);
    }

    const value = metadata[key];
    if (value === null || value === undefined) {
      continue;
    }

    const expectedType = METADATA_SCHEMA.types[key];
    if (expectedType) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== expectedType) {
        throw new Error(`Metadata field "${key}" must be ${expectedType}, got ${actualType}`);
      }
    }
  }

  for (const required of METADATA_SCHEMA.required) {
    if (!(required in metadata)) {
      throw new Error(`Missing required metadata field: ${required}`);
    }
  }

  return true;
}

function enrichMetadata(metadata, defaults = {}) {
  const validated = { ...defaults, ...metadata };
  validateMetadata(validated);
  return validated;
}

module.exports = { validateMetadata, enrichMetadata, METADATA_SCHEMA };
