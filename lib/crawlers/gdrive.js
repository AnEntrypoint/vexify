'use strict';

const { google } = require('googleapis');
const { GoogleDriveAuth } = require('../auth/google-drive');
const { getProcessor } = require('../processors');
const fs = require('fs');

class GoogleDriveCrawler {
  constructor(options = {}) {
    this.auth = null;
    this.drive = null;
    this.authOptions = options;
    this.maxFiles = options.maxFiles || 1000;
    this.stateFile = options.stateFile || '.gdrive-sync-state.json';
    this.incrementalMode = options.incrementalMode || false;
    this.supportedMimeTypes = {
      'application/pdf': '.pdf',
      'application/vnd.google-apps.document': '.gdoc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/json': '.json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-excel': '.xls',
      'text/html': '.html'
    };
    this.exportFormats = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.presentation': 'application/pdf'
    };
  }

  async initialize() {
    const authClient = new GoogleDriveAuth(this.authOptions);
    this.auth = await authClient.authenticate();
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  loadState() {
    if (fs.existsSync(this.stateFile)) {
      const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return {
        fileMetadata: data.fileMetadata || {},
        workQueue: data.workQueue || [],
        lastSyncTime: data.lastSyncTime || null
      };
    }
    return { fileMetadata: {}, workQueue: [], lastSyncTime: null };
  }

  saveState(state) {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  async getExistingFiles(vecStore) {
    const db = vecStore.store.db;
    const rows = db.prepare(`
      SELECT DISTINCT json_extract(metadata, '$.fileId') as fileId,
                      json_extract(metadata, '$.modifiedTime') as modifiedTime
      FROM documents
      WHERE json_extract(metadata, '$.source') = 'gdrive'
      AND json_extract(metadata, '$.fileId') IS NOT NULL
    `).all();

    const existing = {};
    for (const row of rows) {
      if (row.fileId) {
        existing[row.fileId] = row.modifiedTime;
      }
    }
    return existing;
  }

  isSupportedFile(file) {
    return this.supportedMimeTypes[file.mimeType] || this.exportFormats[file.mimeType];
  }

  async scanAllFiles(folderId, allFiles = []) {
    let pageToken = null;

    do {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        pageSize: 1000,
        pageToken: pageToken
      });

      const files = response.data.files;

      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await this.scanAllFiles(file.id, allFiles);
        } else if (this.isSupportedFile(file)) {
          allFiles.push(file);
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return allFiles;
  }

  async buildWorkPlan(vecStore, allFiles, existingFiles) {
    const plan = {
      toAdd: [],
      toUpdate: [],
      toDelete: [],
      unchanged: []
    };

    const currentFileIds = new Set(allFiles.map(f => f.id));

    for (const file of allFiles) {
      const existingModTime = existingFiles[file.id];

      if (!existingModTime) {
        plan.toAdd.push(file);
      } else if (existingModTime !== file.modifiedTime) {
        plan.toUpdate.push(file);
      } else {
        plan.unchanged.push(file);
      }
    }

    const existingIds = Object.keys(existingFiles);
    plan.toDelete = existingIds.filter(id => !currentFileIds.has(id));

    return plan;
  }

  async processFile(file, vecStore, isUpdate = false) {
    let buffer;
    let extension = this.supportedMimeTypes[file.mimeType];

    if (this.exportFormats[file.mimeType]) {
      const exportMimeType = this.exportFormats[file.mimeType];
      const response = await this.drive.files.export({
        fileId: file.id,
        mimeType: exportMimeType
      }, { responseType: 'arraybuffer' });
      buffer = new Uint8Array(response.data);
      extension = this.supportedMimeTypes[exportMimeType];
    } else {
      const response = await this.drive.files.get({
        fileId: file.id,
        alt: 'media'
      }, { responseType: 'arraybuffer' });
      buffer = new Uint8Array(response.data);
    }

    const ProcessorClass = getProcessor(extension);
    if (!ProcessorClass) {
      throw new Error(`No processor for extension: ${extension}`);
    }

    const processor = new ProcessorClass();
    const documents = await processor.processBuffer(buffer, file.name, {
      source: 'gdrive',
      fileId: file.id,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size
    });

    if (isUpdate) {
      const db = vecStore.store.db;
      db.prepare(`
        DELETE FROM documents
        WHERE json_extract(metadata, '$.fileId') = ?
      `).run(file.id);
    }

    for (const doc of documents) {
      doc.metadata.driveUrl = `https://drive.google.com/file/d/${file.id}/view`;
      await vecStore.addDocument(doc.id, doc.content, doc.metadata);
    }
  }

  async executeWorkPlan(vecStore, plan, state) {
    const results = {
      processed: 0,
      updated: 0,
      skipped: plan.unchanged.length,
      deleted: 0,
      errors: []
    };

    if (plan.toDelete.length > 0) {
      console.error(`\n🗑️  Removing ${plan.toDelete.length} deleted files...`);
      const db = vecStore.store.db;
      for (const fileId of plan.toDelete) {
        db.prepare(`DELETE FROM documents WHERE json_extract(metadata, '$.fileId') = ?`).run(fileId);
        delete state.fileMetadata[fileId];
      }
      results.deleted = plan.toDelete.length;
    }

    const workItems = [
      ...plan.toAdd.map(f => ({ file: f, isUpdate: false })),
      ...plan.toUpdate.map(f => ({ file: f, isUpdate: true }))
    ];

    if (state.workQueue && state.workQueue.length > 0) {
      const completedIds = new Set(Object.keys(state.fileMetadata));
      const remaining = workItems.filter(item => !completedIds.has(item.file.id));
      console.error(`\n📋 Resuming: ${remaining.length} files remaining\n`);
    }

    const limit = this.incrementalMode ? 1 : this.maxFiles;
    let processed = 0;

    for (const { file, isUpdate } of workItems) {
      if (state.fileMetadata[file.id]?.processedAt) continue;

      if (processed >= limit) break;

      try {
        const action = isUpdate ? 'Updating' : 'Adding';
        console.error(`  [${processed + 1}/${Math.min(workItems.length, limit)}] ${action}: ${file.name}`);

        await this.processFile(file, vecStore, isUpdate);

        state.fileMetadata[file.id] = {
          name: file.name,
          modifiedTime: file.modifiedTime,
          processedAt: new Date().toISOString()
        };

        this.saveState(state);

        if (isUpdate) {
          results.updated++;
        } else {
          results.processed++;
        }

        processed++;
      } catch (error) {
        results.errors.push({ file: file.name, error: error.message });
        console.error(`  Error: ${error.message}`);
      }
    }

    return results;
  }

  async crawl(folderId = 'root', vecStore) {
    if (!this.drive) {
      await this.initialize();
    }

    console.error(`\n📂 Scanning Google Drive folder: ${folderId}`);
    const startScan = Date.now();

    const allFiles = await this.scanAllFiles(folderId);
    const scanTime = ((Date.now() - startScan) / 1000).toFixed(1);

    console.error(`✓ Scanned ${allFiles.length} files in ${scanTime}s`);

    const existingFiles = await this.getExistingFiles(vecStore);
    console.error(`  Existing in DB: ${Object.keys(existingFiles).length}`);

    const plan = await this.buildWorkPlan(vecStore, allFiles, existingFiles);

    console.error(`\n📋 Work Plan:`);
    console.error(`  New: ${plan.toAdd.length}`);
    console.error(`  Updated: ${plan.toUpdate.length}`);
    console.error(`  Unchanged: ${plan.unchanged.length}`);
    console.error(`  To Delete: ${plan.toDelete.length}`);

    const state = this.loadState();
    state.lastScanTime = new Date().toISOString();

    const results = await this.executeWorkPlan(vecStore, plan, state);

    state.lastSyncTime = new Date().toISOString();
    this.saveState(state);

    return results;
  }
}

module.exports = { GoogleDriveCrawler };
