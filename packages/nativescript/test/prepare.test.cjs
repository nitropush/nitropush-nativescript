const test = require('node:test');
const assert = require('node:assert/strict');
const { patchAndroid, patchIOS, injectConfiguration } = require('../scripts/prepare.cjs');
test('Android root selection runs before AppConfig, and hook is idempotent', () => {
  const original = 'extractAssets();\nAppConfig appConfig = new AppConfig(appDir);\ninitializeRuntime(appDir);';
  const patched = patchAndroid(original);
  assert.ok(patched.indexOf('selectRoot') > patched.indexOf('extractAssets'));
  assert.ok(patched.indexOf('selectRoot') < patched.indexOf('new AppConfig'));
  assert.equal(patchAndroid(patched), patched);
  assert.throws(() => patchAndroid('new Runtime()'), /Unsupported/);
});
test('Android bridge exposes the selected application directory to JS asset resolution', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../platforms/android/java/com/nitropush/sdk/NitroPushNativeScript.kt'),
    'utf8',
  );
  assert.match(source, /applicationRoot = File\(embeddedRoot, "app"\)\.absolutePath/);
  assert.match(source, /applicationRoot = File\(root, "app"\)\.absolutePath/);
  assert.match(source, /fun getApplicationRoot\(\): String = applicationRoot/);
});
test('iOS selection precedes V8 allocation and preserves debug guard', () => {
  const patched = patchIOS('NativeScript *runtime = [[NativeScript alloc] initWithConfig:config];');
  assert.ok(patched.indexOf('selectRoot') < patched.indexOf('[[NativeScript alloc]'));
  assert.match(patched, /#if !DEBUG/);
  assert.equal(patchIOS(patched), patched);
  assert.throws(() => patchIOS('startRuntime();'), /Unsupported/);
});
test('native configuration is replaced and XML escaped', () => {
  for (const [platform, source] of [['ios', '<plist><dict></dict></plist>'], ['android', '<manifest><application></application></manifest>']]) {
    const first = injectConfiguration(source, { NITROPUSH_DEPLOYMENT_KEY: 'a&b' }, platform);
    const second = injectConfiguration(first, { NITROPUSH_DEPLOYMENT_KEY: 'new' }, platform);
    assert.match(first, /a&amp;b/);
    assert.equal((second.match(/NITROPUSH_DEPLOYMENT_KEY/g) || []).length, 1);
    assert.ok(!second.includes('a&amp;b'));
  }
});
