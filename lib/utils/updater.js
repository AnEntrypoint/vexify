'use strict';

class Updater {
  constructor(vecStore) {
    this.vecStore = vecStore;
  }

  async updateAll() {
    const allDocs = await this.vecStore.store.getAll();
    const currentVersion = this.vecStore.version;

    const results = {
      checked: allDocs.length,
      reprocessed: 0,
      errors: []
    };

    for (const doc of allDocs) {
      if (!doc.metadata) {
        continue;
      }

      const docVersion = doc.version || '0.0.0';
      if (this.compareVersions(currentVersion, docVersion) <= 0) {
        continue;
      }

      try {
        const content = doc.content ? JSON.parse(doc.content) : null;
        if (!content) {
          continue;
        }

        const vector = await this.vecStore.embedder.embed(content);
        const checksum = this.vecStore.calculateChecksum(content);

        const updatedDoc = {
          id: doc.id,
          vector,
          checksum,
          version: currentVersion,
          ...(this.vecStore.storeContent && { content }),
          metadata: doc.metadata ? JSON.parse(doc.metadata) : null
        };

        await this.vecStore.store.put(updatedDoc);
        results.reprocessed++;

      } catch (error) {
        results.errors.push({ id: doc.id, error: error.message });
      }
    }

    return results;
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;

      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }

    return 0;
  }
}

module.exports = { Updater };
