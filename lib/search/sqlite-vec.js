'use strict';

class SqliteVecSearch {
  constructor(db, tableName = 'vec_index', dimensions = 768) {
    this.db = db;
    this.tableName = tableName;
    this.dimensions = dimensions;
  }

  async initialize() {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[${this.dimensions}]
      )
    `);
  }

  async addDocument(doc) {
    const vectorJson = JSON.stringify(doc.vector);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (id, embedding)
      VALUES (?, ?)
    `);
    stmt.run(doc.id, vectorJson);
  }

  async searchIndex(queryVector, topK) {
    const queryJson = JSON.stringify(queryVector);

    const stmt = this.db.prepare(`
      SELECT
        d.id,
        d.content,
        d.metadata,
        distance
      FROM ${this.tableName} v
      JOIN documents d ON v.id = d.id
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `);

    const rows = stmt.all(queryJson, topK);

    return rows.map(row => ({
      id: row.id,
      content: row.content ? JSON.parse(row.content) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      score: 1 - row.distance
    }));
  }

  async delete(id) {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    stmt.run(id);
  }
}

module.exports = { SqliteVecSearch };
