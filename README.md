# NitroPush for NativeScript

Signed over-the-air application-tree updates for NativeScript on iOS and Android.

[Setup and API guide](https://docs.nitropush.org/docs/sdk/nativescript) · [Website](https://nitropush.org) · [GitHub](https://github.com/nitropush/)

This is an **experimental alpha**, not a production-readiness or npm-release announcement. Bundle signing and an exact native runtime fingerprint are required. Updates activate on the next cold restart. Test signed updates, assets, offline startup, failed-launch rollback, and native binary upgrades on both platforms before production use.

## Repository contents

```text
packages/nativescript/       SDK, NativeScript adapters, required shared native engine, tests
apps/nativescript-example/   React NativeScript example (not a React Native app)
```

Only these two workspaces are included. The backend, dashboard, CLI source, React Native package, Expo example, deployment configuration, and credentials are not mirrored.

## Build and test

Use Node.js 22 and the Yarn version declared in `package.json`:

```sh
corepack enable
yarn install
yarn build
yarn test
yarn typecheck
```

The shared Swift/Kotlin engine files needed by NativeScript are checked in under the SDK's `platforms/` tree. The build verifies their SHA-256 checksums against `native-core.json`. No React Native checkout or Nitro Modules dependency is needed.

## Install the local alpha

Until an npm release is explicitly published, build and package from this repository:

```sh
yarn build
npm pack ./packages/nativescript
```

Install the resulting `.tgz` in your NativeScript app, then follow the [SDK README](packages/nativescript/README.md) for the prepare hook, deployment key, signing public key, lifecycle calls, and signed uploads. Keep private signing keys out of the application and Git.

## Run the example

Install the NativeScript CLI's Android/iOS prerequisites (iOS requires macOS and Xcode). Configure your own NativeScript dashboard project and signing keys as described in the [example README](apps/nativescript-example/README.md).

```sh
yarn build
yarn example build:android
# On macOS:
yarn example build:ios
```

No real deployment or signing keys are included. Use the [published CLI](https://docs.nitropush.org/docs/cli) for uploads; it is maintained separately.

## Source synchronization

This repository is a filtered mirror. Relevant pushes to the source repository's `main` branch open or update a rolling `bot/sync-from-monorepo` pull request here. Merging that PR updates `main`; no npm package is published automatically. SDK unit tests, type checks, and tarball packaging run in CI. These checks do not replace native device testing.

Changes should be made in the canonical source repository. Direct edits to the bot branch will be replaced by the next snapshot sync. Only an allowlisted snapshot is copied; private repository history and commit messages are not exported.
