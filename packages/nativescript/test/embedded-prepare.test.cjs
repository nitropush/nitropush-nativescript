const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { prepare } = require('../scripts/prepare.cjs');

function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), 'np-embedded-prepare-'));
  const oldKey = process.env.NITROPUSH_DEPLOYMENT_KEY, oldPublic = process.env.NITROPUSH_BUNDLE_PUBLIC_KEY;
  process.env.NITROPUSH_DEPLOYMENT_KEY = 'test-build-key'; process.env.NITROPUSH_BUNDLE_PUBLIC_KEY = 'test-build-public-key';
  function put(path, value) { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); return file; }
  try {
    put('package.json', '{"name":"fixture","dependencies":{}}'); put('package-lock.json', '{}');
    put('nativescript.config.ts', 'export default { id: "org.test" };');
    callback(root, put);
  } finally {
    if (oldKey === undefined) delete process.env.NITROPUSH_DEPLOYMENT_KEY; else process.env.NITROPUSH_DEPLOYMENT_KEY = oldKey;
    if (oldPublic === undefined) delete process.env.NITROPUSH_BUNDLE_PUBLIC_KEY; else process.env.NITROPUSH_BUNDLE_PUBLIC_KEY = oldPublic;
    rmSync(root, { recursive: true, force: true });
  }
}

for (const platform of ['android', 'ios']) test(`NativeScript ${platform} prepare produces immutable embedded app inventory`, () => fixture((root, put) => {
  const platformRoot = `platforms/${platform}`;
  if (platform === 'android') {
    put(`${platformRoot}/app/src/main/java/RuntimeHelper.java`, 'AppConfig appConfig = new AppConfig(appDir);');
    put(`${platformRoot}/app/src/main/AndroidManifest.xml`, '<manifest><application></application></manifest>');
  } else {
    put(`${platformRoot}/fixture/main.m`, 'auto runtime = [[NativeScript alloc] initWithConfig:config];');
    put(`${platformRoot}/fixture/Info.plist`, '<plist><dict></dict></plist>');
  }
  const app = `${platformRoot}/${platform === 'android' ? 'app/src/main/assets' : 'fixture'}/app`;
  put(`${app}/package.json`, '{"main":"bundle.js"}'); put(`${app}/bundle.js`, 'compiled app'); put(`${app}/images/logo.png`, 'image');
  prepare(root, platform);
  const first = readFileSync(join(root, app, 'nitropush-embedded-assets.json'), 'utf8');
  const value = JSON.parse(first);
  assert.equal(value.platform, platform); assert.equal(value.entries.length, 3);
  assert(value.entries.every(entry => entry.path.startsWith('app/')));
  prepare(root, platform);
  assert.equal(readFileSync(join(root, app, 'nitropush-embedded-assets.json'), 'utf8'), first);
}));

test('missing prepared app tree does not partially patch bootstrap', () => fixture((root, put) => {
  const source = 'AppConfig appConfig = new AppConfig(appDir);';
  const bootstrap = put('platforms/android/app/src/main/java/RuntimeHelper.java', source);
  put('platforms/android/app/src/main/AndroidManifest.xml', '<manifest><application></application></manifest>');
  assert.throws(() => prepare(root, 'android'), /unique generated android app tree/);
  assert.equal(readFileSync(bootstrap, 'utf8'), source);
}));
