import type { Context } from '@taucad/kcl-wasm-lib';
import type { WasmModule } from '#zoo-wasm-module.types.js';
import type { FileSystemManager } from '#filesystem-manager.js';
import { OfflineEngine } from '#offline/offline-engine.js';
import { OfflineEngineBridge } from '#offline/offline-engine-bridge.js';
import type { Oc } from '#offline/offline-occt.js';
import { OfflineProfiler } from '#offline/offline-profiler.js';
import { loadLibcascade } from '#offline/offline-libcascade.js';

/** Loads a libcascade instance; injectable so hosts can choose the WASM URL and build variant. */
export type OcctLoader = () => Promise<Oc>;

/**
 * Connects KCL WASM to the in-process libcascade engine instead of the Zoo WebSocket.
 *
 * It has the same surface as `EngineConnection`, so `KclUtilities` can switch between online and offline
 * execution without changing its execute or export paths.
 *
 * @public
 */
export class OfflineEngineConnection {
  /** Shared profiler: every offline session records into it until a caller takes a snapshot. */
  public static readonly profiler = new OfflineProfiler();
  /**
   * Whether to time every libcascade call, set before the first `initialize`. Off by default: the per-call wrappers
   * cost time on the millions of small calls a model makes, so only reports turn it on. Commands are always timed.
   */
  public static profileOcct = false;
  /** Debug mode for new sessions: topology-check every solid a command changes (`OfflineEngine.validationIssues`). */
  public static validateSolids = false;
  private static occt: Promise<Oc> | undefined;
  private readonly wasmModule: WasmModule;
  private readonly fileSystemManager: FileSystemManager;
  private readonly loadOcct: OcctLoader;
  private session: { context: Context; bridge: OfflineEngineBridge; engine: OfflineEngine } | undefined;

  public constructor(options: { wasmModule: WasmModule; fileSystemManager: FileSystemManager; loadOcct?: OcctLoader }) {
    this.wasmModule = options.wasmModule;
    this.fileSystemManager = options.fileSystemManager;
    this.loadOcct = options.loadOcct ?? loadLibcascade;
  }

  /** @returns the WASM `Context` bound to the offline bridge, once initialized */
  public get context(): Context | undefined {
    return this.session?.context;
  }

  /** @returns the bridge that answers kcl-lib's engine calls, once initialized */
  public get bridge(): OfflineEngineBridge | undefined {
    return this.session?.bridge;
  }

  /** @returns the libcascade engine for the open session, for reports and tests */
  public get engine(): OfflineEngine | undefined {
    return this.session?.engine;
  }

  /**
   * There is no socket to close offline; the handler is never called.
   *
   * @param _handler - ignored
   * @returns no-op unsubscriber
   */
  public onSessionClosed(_handler: () => void): () => void {
    return () => {
      /* No socket */
    };
  }

  /** Loads libcascade once per process, then binds a fresh engine and WASM `Context`. */
  public async initialize(): Promise<void> {
    if (this.session) {
      await this.cleanup();
    }

    OfflineEngineConnection.occt ??= (async () => {
      const oc = await this.loadOcct();
      return OfflineEngineConnection.profileOcct ? OfflineEngineConnection.profiler.instrument(oc) : oc;
    })();
    const oc = await OfflineEngineConnection.occt;
    const engine = new OfflineEngine(oc, OfflineEngineConnection.profiler, {
      validate: OfflineEngineConnection.validateSolids,
    });
    const bridge = new OfflineEngineBridge(engine);
    // oxlint-disable-next-line @typescript-eslint/await-thenable -- wasm-bindgen `Context` ctor is Promise-like
    const context: Context = await new this.wasmModule.Context(bridge, this.fileSystemManager);
    bridge.setResponseSink(async (bytes) => {
      await context.sendResponse(bytes);
    });
    this.session = { context, bridge, engine };
  }

  /** Drops the WASM context and the engine's scene. */
  public async cleanup(): Promise<void> {
    this.session?.bridge.dispose();
    this.session?.engine.scene.clear();
    this.session = undefined;
  }
}
