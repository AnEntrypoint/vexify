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
    this.concurrency = config.concurrency || 4;
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

    const total = toAdd.length;
    let processed = 0;

    await this.processWithContinuousPipeline(toAdd, total, results);

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

    await Promise.all(documents.map(async (doc) => {
      const result = await this.vecStore.addDocument(doc.id, doc.content, doc.metadata);
      if (result.skipped) {
        skipped++;
      } else {
        added++;
      }
    }));

    await this.vecStore.flushBuffer();

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

  async processWithContinuousPipeline(files, total, results) {
    let processed = 0;
    const fileQueue = [...files];
    const prefetchQueue = [];
    const MAX_PREFETCH = 5;

    const prefetchWorker = async () => {
      while (fileQueue.length > 0 || prefetchQueue.length > 0) {
        while (prefetchQueue.length < MAX_PREFETCH && fileQueue.length > 0) {
          const file = fileQueue.shift();
          if (file) {
            try {
              const documents = await this.extractDocuments(file);
              prefetchQueue.push({ file, documents });
            } catch (error) {
              results.errors.push({ file: file.relativePath, error: error.message });
              processed++;
            }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    const prefetchPromise = prefetchWorker();

    const processWorker = async () => {
      while (prefetchQueue.length > 0 || fileQueue.length > 0) {
        if (prefetchQueue.length > 0) {
          const { file, documents } = prefetchQueue.shift();
          processed++;
          console.error(`[${processed}/${total}] Processing: ${file.relativePath}`);

          documents.forEach(doc => {
            this.vecStore.addDocument(doc.id, doc.content, doc.metadata).catch((err) => {
              console.error(`Failed to add document ${doc.id}:`, err.message);
            });
          });

          results.added += documents.length;

          if (processed % 100 === 0) {
            await this.vecStore.flushBuffer();
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    };

    await Promise.all([prefetchPromise, processWorker()]);
    await this.vecStore.flushBuffer();
    await this.vecStore.embeddingQueue.drain();
    await this.vecStore.flushBuffer();
  }

  async extractDocuments(file) {
    const ProcessorClass = getProcessor(file.extension);
    if (!ProcessorClass) {
      throw new Error(`No processor found for extension: ${file.extension}`);
    }

    const processor = new ProcessorClass();
    const documents = await processor.process(file.fullPath);

    return documents;
  }
}

module.exports = { FolderSync };
