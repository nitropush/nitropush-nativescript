# @nitropush/nativescript

Experimental signed application-tree OTA updates using NitroPush's existing release API, schema-4 signing contract, content-addressed storage, rollout controls, native telemetry and rollback engine. No React Native or Nitro Modules dependency is installed in the application.

This is an **alpha integration**. Full application boot, worker/asset resolution, process-kill recovery and native binary upgrade behavior must pass device testing before production use. Vite, SwiftUI bootstrap, snapshots, immediate reload and resume/suspend installation are not supported in this version.

## Supported build inputs

The bootstrap hooks target the installed NativeScript CLI 9.1.1, core 9.1.1, Android 9.1.1, iOS 9.1.0 and Webpack 5.0.38 templates. The native engine requires iOS 15+. Android example minimum SDK is 26. A different template fails preparation if its startup insertion point cannot be identified.

Build this workspace package before preparing an app:

```sh
yarn workspace @nitropush/nativescript build
```

The build packages the same Swift/Kotlin engine sources as `@nitropush/react-native`, with a NativeScript host adapter. This standalone repository checks in only the shared engine files required by NativeScript. `native-core.json` records their SHA-256 checksums; the build verifies them before packaging. Update the canonical engine in the source repository, not these copies. No package is published by these build commands.

## Native setup

The public npm package was not available at the September 10, 2026 registry
check. For a consuming app outside this workspace, run
`npm pack ./packages/nativescript` from the monorepo after building, then install
the resulting `nitropush-nativescript-0.1.0-alpha.0.tgz` in that app. The package's
prepack hook compiles the SDK and verifies the included native sources. Recheck availability before using a
registry alpha; these commands do not publish it.

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

The fingerprint conservatively includes platform, bootstrap ABI, packaged NitroPush native sources, dependency versions, the lockfile, `nativescript.config.ts` and `App_Resources`. Changes to those inputs require a new native binary. Keep native additions in those tracked inputs; unsupported hand edits to generated native projects are not fingerprinted. The fingerprint is written to `platforms/<platform>/nitropush-runtime.json` for use as the upload's `--runtime-version` (`--app-version` is a deprecated alias).

The fingerprint is not the release number or bundle hash. The dashboard displays the server-assigned OTA sequence (1, 2, 3, … per project/environment/runtime; reservations may leave gaps). The native fingerprint gates compatibility, while per-file SHA-256 protects content integrity and caching. Keep both: changing JavaScript or an image can change content hashes without changing native compatibility. See the [complete NativeScript guide](https://docs.nitropush.org/docs/sdk/nativescript).

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
  --runtime-version RUNTIME_FINGERPRINT_FROM_NATIVE_BUILD \
  --label 1.0.1 \
  --kind nativescript \
  --bundle-path ./platforms/android/app/src/main/assets/app \
  --signing-key ./nitropush-signing.pem
```

Publish iOS and Android separately. NativeScript requires signatures and an exact runtime target, with no `*`. The server authenticates `kind: nativescript`, runtime, platform, deployment generation and every file using the existing schema-4 signature. Native binaries and metadata are rejected from the OTA inventory. The native selector rechecks the entire signed local tree offline before boot. The emitted `package.json` and Android native class registration script must equal the binary baseline; changing those requires a new binary.

A NativeScript app tree cannot be uploaded to a React Native project, including through either direct API. Expo and CodePush remain valid for React Native projects.

## File delta releases

Add `--delta` to the upload command to compare the complete tree with the latest release for the same project, environment, platform, runtime and deployment generation. Unchanged files are referenced without re-uploading their bytes. Changed files use bounded `npdiff1` copy/insert patches when the patch saves at least 20%; new or unrelated files are sent in full. The server reconstructs and verifies the signed inventory before publishing and stores full files alongside patches.

The updated NativeScript SDK automatically applies these file patches when the referenced base release is active. It snapshots the base file, verifies its hash, applies a bounded patch, and verifies the output against the signed target hash and size. Missing, corrupt or mismatched bases/patches fall back to the full file. Existing content-hash caching reuses unchanged assets. Deleted files are absent from the new tree; the active tree is never patched in place. Cold-launch verification and rollback remain enabled.

A native rebuild is required to adopt the decoder, and its fingerprint changes. The first release for that runtime transfers full files. Subsequent uploads can use `--delta`. Older clients ignore optional file-patch metadata and download full files. CLI savings cover file content before manifest, base64 and HTTP overhead; native `download_delta_applied` telemetry reports actual patch versus reconstructed-file bytes. This format is separate from the Hermes `bsdiff4` bundle format.

## Validation and release gates

Run `yarn workspace @nitropush/nativescript build` followed by `yarn workspace @nitropush/nativescript test`. Tests cover JS lifecycle/coalescing, unsupported modes, and bootstrap transforms. Backend and CLI tests cover framework targeting, complete inventory collection and unsafe artifacts. Native compile checks are separate from a working release-mode device launch.

Before distributing this alpha, run signed full-tree update, missing/corrupt asset, offline launch, failed first launch, native upgrade, workers/lazy imports and forced termination tests on both platforms. The shared engine still uses its existing preference-based launch state; a journal with power-loss fault injection and persisted anti-replay high-water marks remain production release gates from the supplied design.

Cross-system CLI/server and Swift/Kotlin delta integration tests run in the source repository. This mirror includes the SDK lifecycle, bootstrap, and fingerprint unit tests; native release-mode device testing is still required.
