'use strict';

const processors = new Map();

function register(ProcessorClass) {
  const extensions = ProcessorClass.extensions;
  if (!Array.isArray(extensions)) {
    throw new Error(`Processor ${ProcessorClass.name} must define static extensions array`);
  }

  extensions.forEach(ext => {
    processors.set(ext.toLowerCase(), ProcessorClass);
  });
}

function getProcessor(extension) {
  const ext = extension.toLowerCase();
  return processors.get(ext);
}

function getAllExtensions() {
  return Array.from(processors.keys());
}

function autoDiscoverProcessors() {
  const fs = require('fs');
  const path = require('path');

  const processorsDir = __dirname;
  const files = fs.readdirSync(processorsDir);

  files.forEach(file => {
    if (file === 'base.js' || file === 'registry.js' || file === 'index.js') {
      return;
    }

    if (file.endsWith('.js')) {
      const processorPath = path.join(processorsDir, file);
      const ProcessorModule = require(processorPath);

      Object.values(ProcessorModule).forEach(exported => {
        if (typeof exported === 'function' && exported.extensions) {
          register(exported);
        }
      });
    }
  });
}

module.exports = { register, getProcessor, getAllExtensions, autoDiscoverProcessors };
