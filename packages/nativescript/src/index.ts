/** Native bootstrap configures the signed update engine before any application JS executes. */
export enum InstallMode { ON_NEXT_RESTART = "ON_NEXT_RESTART" }
export enum SyncStatus {
  CHECKING_FOR_UPDATE = "CHECKING_FOR_UPDATE",
  UP_TO_DATE = "UP_TO_DATE",
  UPDATE_INSTALLED = "UPDATE_INSTALLED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
export interface LocalPackage { releaseId: string; label: string; appVersion: string; isPending: boolean }
export interface NitroPushClient {
  notifyAppReady(): Promise<void>;
  getCurrentPackage(): Promise<LocalPackage | null>;
  getPendingPackage(): Promise<LocalPackage | null>;
  clearPendingUpdate(): Promise<void>;
}
export interface SyncOptions { installMode?: InstallMode }
export type SyncStatusChangedCallback = (status: SyncStatus, error?: Error) => void;
interface NativeBridge { execute(operation: string, callback: (result: string | null, error: string | null) => void): void }
declare const NitroPushNativeScript: { shared: { executeCompletion(operation: string, callback: (result: string | null, error: string | null) => void): void } };
declare const com: { nitropush: { sdk: {
  NitroPushNativeScript: { getInstance(): { execute(operation: string, callback: unknown): void } };
  NitroPushCallback: new (methods: { complete(result: string | null, error: string | null): void }) => unknown;
} } };

const bridges = new WeakMap<NitroPushClient, NativeBridge>();
const inflight = new WeakMap<NitroPushClient, Promise<SyncStatus>>();
let singleton: NitroPushClient | undefined;
function nativeBridge(): NativeBridge {
  if (typeof NitroPushNativeScript !== "undefined") {
    const native = NitroPushNativeScript.shared;
    return { execute: (operation, callback) => native.executeCompletion(operation, callback) };
  }
  if (typeof com !== "undefined" && com.nitropush?.sdk?.NitroPushNativeScript) {
    const native = com.nitropush.sdk.NitroPushNativeScript.getInstance();
    return { execute: (operation, callback) => native.execute(operation, new com.nitropush.sdk.NitroPushCallback({ complete: callback })) };
  }
  throw new Error("NitroPush native bootstrap is missing. Run the NativeScript prepare hook and rebuild the native app.");
}
function execute<T>(bridge: NativeBridge, operation: string): Promise<T> {
  return new Promise((resolve, reject) => bridge.execute(operation, (result, error) => {
    if (error) { reject(new Error(error)); return; }
    try { resolve(JSON.parse(result ?? "null") as T); } catch { reject(new Error("Invalid NitroPush native response")); }
  }));
}
/** Call at module scope. Deployment key, trust root and runtime version are binary-owned. */
export function configure(): NitroPushClient {
  if (singleton) return singleton;
  const bridge = nativeBridge();
  const client: NitroPushClient = {
    notifyAppReady: () => execute<void>(bridge, "ready"),
    getCurrentPackage: () => execute<LocalPackage | null>(bridge, "current"),
    getPendingPackage: () => execute<LocalPackage | null>(bridge, "pending"),
    clearPendingUpdate: () => execute<void>(bridge, "clearPending"),
  };
  bridges.set(client, bridge);
  singleton = client;
  return client;
}
/** Coalesces concurrent checks. UPDATE_INSTALLED means staged for the next cold launch. */
export function sync(client: NitroPushClient, options: SyncOptions = {}, onStatus?: SyncStatusChangedCallback): Promise<SyncStatus> {
  if (options.installMode !== undefined && options.installMode !== InstallMode.ON_NEXT_RESTART) {
    return Promise.reject(new Error("NativeScript supports only ON_NEXT_RESTART"));
  }
  const bridge = bridges.get(client);
  if (!bridge) return Promise.reject(new Error("Call configure() before sync()"));
  const existing = inflight.get(client);
  if (existing) return existing;
  const emit = (status: SyncStatus, error?: Error) => { try { onStatus?.(status, error); } catch { /* observers cannot change an install */ } };
  // Defer observers until the promise is registered, including reentrant sync calls.
  const task = Promise.resolve().then(async () => {
    emit(SyncStatus.CHECKING_FOR_UPDATE);
    try {
      const result = await execute<{ status: string }>(bridge, "sync");
      if (result.status !== SyncStatus.UP_TO_DATE && result.status !== SyncStatus.UPDATE_INSTALLED) throw new Error("Invalid NitroPush sync result");
      const status = result.status as SyncStatus;
      emit(status);
      return status;
    } catch (error) {
      emit(SyncStatus.UNKNOWN_ERROR, error instanceof Error ? error : new Error("Update failed"));
      return SyncStatus.UNKNOWN_ERROR;
    } finally { inflight.delete(client); }
  });
  inflight.set(client, task);
  return task;
}
