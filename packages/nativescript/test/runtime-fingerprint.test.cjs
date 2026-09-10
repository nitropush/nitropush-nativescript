const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { runtimeVersion } = require('../scripts/prepare.cjs');

test('runtime fingerprint is native compatibility, not the changing JS bundle hash', () => {
  const root = mkdtempSync(join(tmpdir(), 'nitropush-fingerprint-test-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: {} }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(root, 'nativescript.config.ts'), 'export default { id: "org.test" };');
    mkdirSync(join(root, 'app'));
    mkdirSync(join(root, 'App_Resources'));
    writeFileSync(join(root, 'app/app.js'), 'console.log("baseline")');
    const base = runtimeVersion(root, 'android');
    assert.match(base, /^[a-f0-9]{64}$/);
    assert.notEqual(runtimeVersion(root, 'ios'), base, 'platforms have independent compatibility');
    writeFileSync(join(root, 'app/app.js'), 'console.log("new OTA")');
    writeFileSync(join(root, 'app/image.png'), 'new image fixture');
    assert.equal(runtimeVersion(root, 'android'), base, 'JS and image OTA do not invalidate the binary');
    writeFileSync(join(root, 'App_Resources/native.xml'), '<permissions/>');
    const nativeChange = runtimeVersion(root, 'android');
    assert.notEqual(nativeChange, base, 'native resources require a rebuild');
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion": 3}');
    assert.notEqual(runtimeVersion(root, 'android'), nativeChange, 'lockfile changes conservatively require a rebuild');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
