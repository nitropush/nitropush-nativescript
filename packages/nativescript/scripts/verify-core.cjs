// Shared native sources are materialized by the source repository's mirror.
// No React Native package, checkout, download, or build is needed here.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = require('../native-core.json');
if (Object.keys(manifest).length !== 11) throw new Error('Incomplete NativeScript native-core manifest');
for (const [file, expected] of Object.entries(manifest)) {
  if (!file.startsWith('platforms/') || file.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('Invalid native-core manifest entry');
  }
  const actual = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== expected) throw new Error(`Native core mismatch: ${file}. Re-sync from the source repository.`);
}
console.log('Verified 11 shared native engine files.');
