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
        metadata TEXT
      );
    `);
  }

  async put(doc) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, vector, content, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const vectorBlob = Buffer.from(new Float32Array(doc.vector).buffer);
    const metadataJson = doc.metadata ? JSON.stringify(doc.metadata) : null;
    const contentJson = doc.content !== undefined ? JSON.stringify(doc.content) : null;

    stmt.run(doc.id, vectorBlob, contentJson, metadataJson);
  }

  async getAll() {
    const stmt = this.db.prepare('SELECT * FROM documents');
    const rows = stmt.all();

    return rows.map(row => {
      const vectorArray = Array.from(new Float32Array(row.vector.buffer));

      return {
        id: row.id,
        vector: vectorArray,
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