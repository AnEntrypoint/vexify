'use strict';

class IndexingState {
  constructor() {
    this.indexingPromise = null;
    this.indexingCompleted = false;
    this.backgroundIndexInterval = 1000;
  }

  isIndexing() {
    return this.indexingPromise !== null && !this.indexingCompleted;
  }

  markIndexingComplete() {
    this.indexingCompleted = true;
    this.indexingPromise = null;
  }

  setIndexingPromise(promise) {
    this.indexingPromise = promise;
    this.indexingCompleted = false;
  }

  reset() {
    this.indexingPromise = null;
    this.indexingCompleted = false;
  }
}

module.exports = { IndexingState };
