# @nitropush/nativescript

Experimental signed application-tree OTA updates using NitroPush's existing release API, schema-4 signing contract, content-addressed storage, rollout controls, native telemetry and rollback engine. No React Native or Nitro Modules dependency is installed in the application.

This is an **alpha integration**. Full application boot, worker/asset resolution, process-kill recovery and native binary upgrade behavior must pass device testing before production use. Vite, SwiftUI bootstrap, snapshots, immediate reload, resume/suspend installation and NativeScript delta updates are not supported in this version.

## Supported build inputs

The bootstrap hooks target the installed NativeScript CLI 9.1.1, core 9.1.1, Android 9.1.1, iOS 9.1.0 and Webpack 5.0.38 templates. The native engine requires iOS 15+. Android example minimum SDK is 26. A different template fails preparation if its startup insertion point cannot be identified.

Build this workspace package before preparing an app:

```sh
yarn workspace @nitropush/nativescript build
```

The build packages the same Swift/Kotlin engine sources as `@nitropush/react-native`, with a NativeScript host adapter. This standalone repository checks in only the shared engine files required by NativeScript. `native-core.json` records their SHA-256 checksums; the build verifies them before packaging. Update the canonical engine in the source repository, not these copies. No package is published by these build commands.

## Native setup

Create a **NativeScript** project in the dashboard, create an environment and register an ECDSA P-256 signing public key. Existing projects remain React Native; their uploads cannot be switched to NativeScript. The framework cannot be changed after project creation.

Install this package and add `hooks/after-prepare/nitropush.js` to the application:

```js
module.exports = function ($projectData, hookArgs) {
  const platform = hookArgs.platform || hookArgs.prepareData?.platform;
  if (!platform) throw new Error('Missing NativeScript prepare platform');
  require('@nitropush/nativescript/scripts/prepare.cjs')
    .prepare($projectData.projectDir, platform.toLowerCase());
};
```

Set `NITROPUSH_DEPLOYMENT_KEY` and `NITROPUSH_BUNDLE_PUBLIC_KEY` in the build environment. The public key is base64 DER SPKI; the private signing key must never be included in the app. The hook injects these public client configuration values and a runtime fingerprint into generated native configuration, then patches the native startup location. Keep generated `platforms/` files out of source control.

The fingerprint conservatively includes platform, bootstrap ABI, packaged NitroPush native sources, dependency versions, the lockfile, `nativescript.config.ts` and `App_Resources`. Changes to those inputs require a new native binary. Keep native additions in those tracked inputs; unsupported hand edits to generated native projects are not fingerprinted. The fingerprint is written to `platforms/<platform>/nitropush-runtime.json` for use as the upload's `--app-version`.

On iOS, the selector changes `Config.BaseDir` before allocating V8 and retains binary-owned metadata. On Android, it selects the root after APK extraction and before `AppConfig`/runtime initialization, preserving the APK's internal and metadata files. Debug builds retain NativeScript's development loader.

## Application API

```ts
import { configure, sync, InstallMode } from '@nitropush/nativescript';

const client = configure(); // module scope; native configuration is already initialized

// Call only after the first usable screen has loaded:
await client.notifyAppReady();

await sync(client, { installMode: InstallMode.ON_NEXT_RESTART }, status => {
  console.log(status);
});
```

`sync()` coalesces concurrent requests. `UPDATE_INSTALLED` means a complete update was staged; it activates on the next cold process launch. `getCurrentPackage()` and `getPendingPackage()` return package metadata. `clearPendingUpdate()` removes a staged update without changing the running bundle. Unsupported install modes are rejected, never silently mapped to restart. Do not call `notifyAppReady()` during module initialization.

## Upload

Build a release-mode Webpack application and pass its complete **built app directory**, containing the emitted `package.json`, entry script, chunks, workers, CSS/XML, fonts and assets. Do not pass the source `app/` directory or the entire native build directory. `package.json.main` may name the emitted `.js`/`.mjs` entry or its extensionless module name; ambiguous outputs are rejected. Source maps are excluded from delivery.

```sh
nitropush release upload \
  --project PROJECT_ID \
  --environment prod \
  --platforms android \
  --app-version RUNTIME_FINGERPRINT_FROM_NATIVE_BUILD \
  --label 1.0.1 \
  --kind nativescript \
  --bundle-path ./platforms/android/app/src/main/assets/app \
  --signing-key ./nitropush-signing.pem
```

Publish iOS and Android separately. NativeScript requires signatures and an exact runtime target, with no `*`. The server authenticates `kind: nativescript`, runtime, platform, deployment generation and every file using the existing schema-4 signature. Native binaries and metadata are rejected from the OTA inventory. The native selector rechecks the entire signed local tree offline before boot. The emitted `package.json` and Android native class registration script must equal the binary baseline; changing those requires a new binary.

A NativeScript app tree cannot be uploaded to a React Native project, including through either direct API. Expo and CodePush remain valid for React Native projects.

## Validation and release gates

Run `yarn workspace @nitropush/nativescript build` followed by `yarn workspace @nitropush/nativescript test`. Tests cover JS lifecycle/coalescing, unsupported modes, and bootstrap transforms. Backend and CLI tests cover framework targeting, complete inventory collection and unsafe artifacts. Native compile checks are separate from a working release-mode device launch.

Before distributing this alpha, run signed full-tree update, missing/corrupt asset, offline launch, failed first launch, native upgrade, workers/lazy imports and forced termination tests on both platforms. The shared engine still uses its existing preference-based launch state; a journal with power-loss fault injection and persisted anti-replay high-water marks remain production release gates from the supplied design. First updates always download full files; binary delta support is deliberately disabled for NativeScript.
