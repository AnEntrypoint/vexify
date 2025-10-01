'use strict';

const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const path = require('path');
const fs = require('fs');

class SQLiteStorageAdapter {
  constructor(dbPath = './vecstore.db') {
    this.dbPath = dbPath;

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir) && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.loadExtension(sqliteVec.getLoadablePath());
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        content TEXT,
        metadata TEXT,
        checksum TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_checksum ON documents(checksum);
      CREATE INDEX IF NOT EXISTS idx_version ON documents(version);
    `);
  }

  async put(doc) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, vector, content, metadata, checksum, version)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const vectorBlob = Buffer.from(new Float32Array(doc.vector).buffer);
    const metadataJson = doc.metadata ? JSON.stringify(doc.metadata) : null;
    const contentJson = doc.content !== undefined ? JSON.stringify(doc.content) : null;

    stmt.run(doc.id, vectorBlob, contentJson, metadataJson, doc.checksum, doc.version);
  }

  async getByChecksum(checksum) {
    const stmt = this.db.prepare('SELECT id FROM documents WHERE checksum = ?');
    const row = stmt.get(checksum);
    return row ? row.id : null;
  }

  async checksumExists(checksum) {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM documents WHERE checksum = ?');
    const result = stmt.get(checksum);
    return result.count > 0;
  }

  async getBySource(sourceType, sourceValue) {
    const stmt = this.db.prepare('SELECT * FROM documents');
    const rows = stmt.all();
    const results = [];

    for (const row of rows) {
      if (row.metadata) {
        const metadata = JSON.parse(row.metadata);
        if (metadata[sourceType] === sourceValue) {
          results.push(row.id);
        }
      }
    }

    return results;
  }

  async getCrawledUrls() {
    const stmt = this.db.prepare('SELECT metadata FROM documents');
    const rows = stmt.all();
    const urls = new Set();

    for (const row of rows) {
      if (row.metadata) {
        const metadata = JSON.parse(row.metadata);
        if (metadata.source === 'crawl' && metadata.crawlUrl) {
          urls.add(metadata.crawlUrl);
        }
      }
    }

    return urls;
  }

  async deleteByIds(ids) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM documents WHERE id IN (${placeholders})`);
    stmt.run(...ids);
  }

  async getAll() {
    const stmt = this.db.prepare('SELECT * FROM documents');
    const rows = stmt.all();

    return rows.map(row => {
      const vectorArray = Array.from(new Float32Array(row.vector.buffer));

      return {
        id: row.id,
        vector: vectorArray,
        version: row.version,
        checksum: row.checksum,
        ...(row.content !== null && { content: JSON.parse(row.content) }),
        ...(row.metadata !== null && { metadata: JSON.parse(row.metadata) })
      };
    });
  }

  async delete(id) {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    stmt.run(id);
  }

  close() {
    this.db.close();
  }
}

module.exports = { SQLiteStorageAdapter };