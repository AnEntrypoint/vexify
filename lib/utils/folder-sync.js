'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config/defaults');
const { getProcessor, getAllExtensions } = require('../processors');

class FolderSync {
  constructor(vecStore, options = {}) {
    const config = getConfig(options);
    this.vecStore = vecStore;
    this.extensions = config.extensions || getAllExtensions();
    this.recursive = config.recursive;
    this.ignoreDirs = config.ignoreDirs;
  }

  async sync(folderPath) {
    const folderAbsPath = path.resolve(folderPath);

    if (!fs.existsSync(folderAbsPath)) {
      throw new Error(`Folder not found: ${folderAbsPath}`);
    }

    const filesOnDisk = this.scanFolder(folderAbsPath);
    const filesInDb = await this.getTrackedFiles();

    const toAdd = filesOnDisk.filter(f => !filesInDb.has(f.fullPath));
    const toRemove = Array.from(filesInDb).filter(dbPath =>
      !filesOnDisk.some(f => f.fullPath === dbPath)
    );

    const results = {
      added: 0,
      skipped: 0,
      removed: 0,
      errors: []
    };

    for (const file of toAdd) {
      try {
        const result = await this.embedFile(file);
        if (result.skipped) {
          results.skipped += result.count;
        } else {
          results.added += result.count;
        }
      } catch (error) {
        results.errors.push({ file: file.relativePath, error: error.message });
      }
    }

    for (const filePath of toRemove) {
      try {
        await this.removeFile(filePath);
        results.removed++;
      } catch (error) {
        results.errors.push({ file: filePath, error: error.message });
      }
    }

    return results;
  }

  scanFolder(folderPath, basePath = null) {
    const base = basePath || folderPath;
    const baseAbs = path.resolve(base);
    const files = [];
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        if (this.ignoreDirs.includes(entry.name)) {
          continue;
        }
        if (this.recursive) {
          files.push(...this.scanFolder(fullPath, baseAbs));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (this.extensions.includes(ext)) {
          const fullPathAbs = path.resolve(fullPath);
          files.push({
            fullPath: fullPathAbs,
            relativePath: path.relative(baseAbs, fullPathAbs),
            extension: ext,
            name: entry.name
          });
        }
      }
    }

    return files;
  }

  async getTrackedFiles() {
    const allDocs = await this.vecStore.store.getAll();
    const files = new Set();

    for (const doc of allDocs) {
      if (doc.metadata?.source === 'file' && doc.metadata?.filePath) {
        files.add(doc.metadata.filePath);
      }
    }

    return files;
  }

  async embedFile(file) {
    const ProcessorClass = getProcessor(file.extension);

    if (!ProcessorClass) {
      throw new Error(`No processor found for extension: ${file.extension}`);
    }

    const processor = new ProcessorClass();
    const documents = await processor.process(file.fullPath);

    let added = 0;
    let skipped = 0;

    for (const doc of documents) {
      const result = await this.vecStore.addDocument(doc.id, doc.content, doc.metadata);
      if (result.skipped) {
        skipped++;
      } else {
        added++;
      }
    }

    return skipped > 0 ? { skipped: true, count: skipped } : { skipped: false, count: added };
  }

  async removeFile(filePath) {
    const allDocs = await this.vecStore.store.getAll();

    for (const doc of allDocs) {
      if (doc.metadata?.filePath === filePath) {
        await this.vecStore.store.delete(doc.id);
      }
    }
  }
}

module.exports = { FolderSync };
