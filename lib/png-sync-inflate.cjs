'use strict';
const zlib = require('node:zlib');

// pngjs' legacy inflater subclasses private Node internals with Inflate.call().
// Workers exposes Inflate as a class. Use its public, bounded synchronous API.
function inflateSync(buffer, options = {}) {
  const maxOutputLength = options.maxLength ?? options.maxOutputLength;
  return zlib.inflateSync(buffer, {
    chunkSize: Math.min(65536, Math.max(64, options.chunkSize || 16384)),
    ...(maxOutputLength == null ? {} : { maxOutputLength }),
  });
}
module.exports = inflateSync;
module.exports.inflateSync = inflateSync;
