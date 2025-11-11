'use strict';

const fs = require('fs');
const crypto = require('crypto');

class FileMonitor {
  constructor() {
    this.knownFiles = new Map();
    this.fileCache = new Map();
    this.fileChecksums = new Map();
    this.lastFileCheck = 0;
    this.fileCheckInterval = 60000;
    this.lastFullSync = 0;
    this.fullSyncInterval = 300000;
    this.syncValidationEnabled = true;
    this.lastSyncValidation = 0;
    this.syncValidationInterval = 30000;
  }

  clearCache() {
    this.knownFiles.clear();
    this.fileCache.clear();
    this.fileChecksums.clear();
  }

  calculateFileCRC(filePath) {
    try {
      const data = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(data).digest('hex');
    } catch (error) {
      return null;
    }
  }

  calculateEnhancedFileSignature(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const contentHash = this.calculateFileCRC(filePath);
      if (!contentHash) return null;

      return {
        mtime: stats.mtime.getTime(),
        size: stats.size,
        crc: contentHash,
        path: filePath
      };
    } catch (error) {
      return null;
    }
  }

  shouldCheckFiles() {
    return Date.now() - this.lastFileCheck > this.fileCheckInterval;
  }

  shouldPerformFullSync() {
    return Date.now() - this.lastFullSync > this.fullSyncInterval;
  }

  shouldValidateSync() {
    return this.syncValidationEnabled && Date.now() - this.lastSyncValidation > this.syncValidationInterval;
  }

  updateLastFileCheck() {
    this.lastFileCheck = Date.now();
  }

  updateLastFullSync() {
    this.lastFullSync = Date.now();
  }

  updateLastSyncValidation() {
    this.lastSyncValidation = Date.now();
  }
}

module.exports = { FileMonitor };
