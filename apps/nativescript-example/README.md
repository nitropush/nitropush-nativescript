# NativeScript example

A React NativeScript application matching the React Native example’s dark demo screen. It shows running/pending releases, stages signed updates with Refresh, and can roll back a pending update. Health confirmation runs after React mounts.

From the repository root:

```sh
yarn install
yarn workspace @nitropush/nativescript build
```

Set `NITROPUSH_DEPLOYMENT_KEY` and `NITROPUSH_BUNDLE_PUBLIC_KEY` to the values for a NativeScript dashboard project with signing enabled, then use the app's `build:android` or `build:ios` script. Supply the usual platform signing configuration for a release build. The prepare hook writes the exact OTA runtime target to `platforms/<platform>/nitropush-runtime.json`.

For Android, the built tree to upload is `platforms/android/app/src/main/assets/app`. On iOS, use the complete emitted `app` directory from the prepared/built project. Follow the upload command in `packages/nativescript/README.md`, using the generated runtime fingerprint and your private signing key file.

Change `demoVersion` in `app/app.tsx`, build again with the same native inputs, and upload. Open the installed release build, tap **Refresh**, then terminate and reopen the app. Verify both the new text and its running release metadata before considering the update healthy. Test failed-launch rollback on a device before production use.

The example contains no real deployment key, public key or private signing key. Development builds display a configuration message when the native release bootstrap has not run.

Install the published NitroPush CLI using the [CLI installation guide](https://docs.nitropush.org/docs/cli). The CLI source is not included in this repository. `Apply pending update` explains the required cold restart; NativeScript does not perform an in-process reload.
