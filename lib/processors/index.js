'use strict';

const { BaseProcessor } = require('./base');
const { register, getProcessor, getAllExtensions, autoDiscoverProcessors } = require('./registry');

autoDiscoverProcessors();

module.exports = {
  BaseProcessor,
  register,
  getProcessor,
  getAllExtensions,
  autoDiscoverProcessors
};
