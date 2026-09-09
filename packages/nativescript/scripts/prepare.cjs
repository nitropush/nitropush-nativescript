const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function files(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('NativeScript build inputs must not contain symlinks');
    if (['node_modules', 'Pods', 'build', '.gradle', '.git'].includes(entry.name)) return [];
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function runtimeVersion(projectDir, platform) {
  if (!['ios', 'android'].includes(platform)) throw new Error('Expected ios or android');
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  const hash = crypto.createHash('sha256').update(`nitropush-nativescript-bootstrap-v1\n${platform}\n`);
  // Conservative: dependency changes require a new binary, even for JS-only dependencies.
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).sort()) {
    let installed;
    try { installed = JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`, { paths: [projectDir] }), 'utf8')).version; }
    catch { throw new Error(`Install ${name} before deriving the native runtime version`); }
    hash.update(JSON.stringify([name, version, installed]));
  }
  // Workspace SDK edits can change native behavior without a version bump.
  const pluginRoot = path.resolve(__dirname, '..');
  const nativeRoot = path.join(pluginRoot, 'platforms', platform);
  for (const file of files(nativeRoot).filter(file => /\.(swift|kt|c|h)$/.test(file))) {
    hash.update(`nitropush-native/${path.relative(nativeRoot, file).split(path.sep).join('/')}`);
    hash.update(fs.readFileSync(file));
  }
  const inputs = [path.join(projectDir, 'nativescript.config.ts'), ...files(path.join(projectDir, 'App_Resources'))];
  let lockRoot = projectDir;
  while (true) {
    const locks = ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'].map(name => path.join(lockRoot, name)).filter(file => fs.existsSync(file));
    if (locks.length) { inputs.push(...locks); break; }
    const parent = path.dirname(lockRoot);
    if (parent === lockRoot) throw new Error('A dependency lockfile is required for the native runtime fingerprint');
    lockRoot = parent;
  }
  for (const file of inputs.sort()) {
    hash.update(path.relative(projectDir, file).split(path.sep).join('/'));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}
function patchAndroid(source) {
  if (source.includes('nitropush-bootstrap-v1')) return source;
  const anchor = 'AppConfig appConfig = new AppConfig(appDir);';
  if (source.split(anchor).length !== 2) throw new Error('Unsupported NativeScript Android bootstrap: expected one AppConfig(appDir) site');
  return source.replace(anchor, `// nitropush-bootstrap-v1\n                appDir = com.nitropush.sdk.NitroPushNativeScript.selectRoot(context, appDir);\n                ${anchor}`);
}
function patchIOS(source) {
  if (source.includes('nitropush-bootstrap-v1')) return source;
  const matches = [...source.matchAll(/\[\[NativeScript\s+alloc\]\s+initWithConfig:\s*(\w+)\s*\]/g)];
  if (matches.length !== 1) throw new Error('Unsupported NativeScript iOS bootstrap: expected one NativeScript initWithConfig site');
  const config = matches[0][1];
  // Replace the expression, preserving any original variable declaration around it.
  return '#import <NitroPushNativeScript/NitroPushNativeScript-Swift.h>\n' + source.replace(matches[0][0], `({ /* nitropush-bootstrap-v1 */\n#if !DEBUG\n${config}.BaseDir = [NitroPushNativeScript selectRoot:${config}.BaseDir ?: [[NSBundle mainBundle] resourcePath]];\n${config}.ApplicationPath = @"app";\n#endif\n[[NativeScript alloc] initWithConfig:${config}]; })`);
}
function xml(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function injectConfiguration(source, config, platform) {
  for (const [name, value] of Object.entries(config)) {
    if (platform === 'android') {
      source = source.replace(new RegExp(`<meta-data\\s+android:name="${name}"[^>]*\\/>`, 'g'), '');
      source = source.replace('</application>', `<meta-data android:name="${name}" android:value="${xml(value)}"/>\n</application>`);
    } else {
      source = source.replace(new RegExp(`<key>${name}</key>\\s*<string>[^<]*</string>`, 'g'), '');
      source = source.replace(/<\/dict>\s*<\/plist>/, `<key>${name}</key><string>${xml(value)}</string>\n</dict>\n</plist>`);
    }
  }
  return source;
}
function prepare(projectDir, platform) {
  const deploymentKey = process.env.NITROPUSH_DEPLOYMENT_KEY;
  const publicKey = process.env.NITROPUSH_BUNDLE_PUBLIC_KEY;
  if (!deploymentKey || !publicKey) throw new Error('Set NITROPUSH_DEPLOYMENT_KEY and NITROPUSH_BUNDLE_PUBLIC_KEY before preparing the native app');
  const runtime = runtimeVersion(projectDir, platform);
  const root = path.join(projectDir, 'platforms', platform);
  const candidates = files(root);
  const bootstrap = candidates.filter(file => platform === 'android' ? path.basename(file) === 'RuntimeHelper.java' : /main\.(m|mm)$/.test(file) && fs.readFileSync(file, 'utf8').includes('initWithConfig'));
  if (bootstrap.length !== 1) throw new Error(`Unsupported NativeScript ${platform} template: cannot identify a unique native bootstrap source. No files changed.`);
  const configs = candidates.filter(file => platform === 'android' ? file.endsWith('/src/main/AndroidManifest.xml') : /(?:-Info|Info)\.plist$/.test(file) && !file.includes('/framework/'));
  if (configs.length !== 1) throw new Error(`Cannot identify a unique generated ${platform} configuration. No files changed.`);
  const patched = (platform === 'android' ? patchAndroid : patchIOS)(fs.readFileSync(bootstrap[0], 'utf8'));
  const config = injectConfiguration(fs.readFileSync(configs[0], 'utf8'), {
    NITROPUSH_DEPLOYMENT_KEY: deploymentKey,
    NITROPUSH_BUNDLE_PUBLIC_KEY: publicKey,
    NITROPUSH_RUNTIME_VERSION: runtime,
  }, platform);
  fs.writeFileSync(bootstrap[0], patched);
  fs.writeFileSync(configs[0], config);
  fs.writeFileSync(path.join(root, 'nitropush-runtime.json'), JSON.stringify({ framework: 'nativescript', platform, runtimeVersion: runtime }, null, 2) + '\n');
  return runtime;
}
module.exports = { prepare, runtimeVersion, patchAndroid, patchIOS, injectConfiguration };
