import { openDB, IDBPDatabase } from 'idb';
import { Document, StorageAdapter } from '../types/interfaces.js';

export class IDBStorageAdapter implements StorageAdapter {
  private dbName: string;
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName: string) {
    this.dbName = dbName;
    this.dbPromise = this.init();
  }

  private async init(): Promise<IDBPDatabase> {
    return openDB(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      }
    });
  }

  async put(doc: Document): Promise<void> {
    const db = await this.dbPromise;
    await db.put('documents', doc);
  }

  async getAll(): Promise<Document[]> {
    const db = await this.dbPromise;
    return db.getAll('documents');
  }
}
