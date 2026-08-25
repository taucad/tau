import type { Context } from '@taucad/kcl-wasm-lib';
import type { WasmModule } from '#zoo-wasm-module.types.js';
import type { FileSystemManager } from '#filesystem-manager.js';
import type { ZooEngineBridge } from '#bridge/zoo-engine-bridge.js';
import type { ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';

/**
 * Owns the KCL WASM `Context` and pipes raw WebSocket bytes into `sendResponse`.
 *
 * @public
 */
export class ZooEngineSession {
  public context: Context | undefined;
  public readonly bridge: ZooEngineBridge;
  /** Same transport instance passed to {@link ZooEngineBridge}; read-only for session lifecycle hooks. */
  public readonly transport: ZooWebSocketTransport;
  private readonly fileSystemManager: FileSystemManager;
  private readonly wasmModule: WasmModule;
  private unsubscribeResponsePipe: (() => void) | undefined;

  public constructor(optionsReadonly: {
    transport: ZooWebSocketTransport;
    bridge: ZooEngineBridge;
    fileSystemManager: FileSystemManager;
    wasmModule: WasmModule;
  }) {
    this.transport = optionsReadonly.transport;
    this.bridge = optionsReadonly.bridge;
    this.fileSystemManager = optionsReadonly.fileSystemManager;
    this.wasmModule = optionsReadonly.wasmModule;
  }

  /**
   * Constructs {@link Context} after the transport has completed its auth handshake.
   */
  public async openContext(): Promise<void> {
    if (this.context) {
      return;
    }

    if (!this.transport.connected) {
      throw new Error('openContext requires a connected transport');
    }

    // oxlint-disable-next-line @typescript-eslint/await-thenable -- wasm-bindgen `Context` ctor is Promise-like
    this.context = await new this.wasmModule.Context(this.bridge, this.fileSystemManager);
    this.unsubscribeResponsePipe = this.transport.onMessage((raw) => {
      const { context } = this;
      if (context) {
        void context.sendResponse(raw);
      }
    });
  }

  /**
   * Runs the WASM execution pipeline for a parsed program.
   *
   * @param programAstJson - stringified AST
   * @param path - main file path hint (may be undefined)
   * @param settingsJson - stringified KCL engine configuration JSON
   * @returns raw execution outcome from WASM `Context.execute`
   */
  public async execute(programAstJson: string, path: string | undefined, settingsJson: string): Promise<unknown> {
    const { context } = this;
    if (!context) {
      throw new Error('ZooEngineSession: context not open — call openContext() after transport.initialize()');
    }

    return context.execute(programAstJson, path, settingsJson);
  }

  /**
   * Clears caches and resets scene state when supported by the loaded wasm.
   *
   * @param settingsJson - stringified configuration
   * @param path - optional scope path
   * @returns bust outcome, or `undefined` when no context is open
   */
  public async bustCacheAndResetScene(settingsJson: string, path: string | undefined): Promise<unknown> {
    const { context } = this;
    if (!context) {
      return undefined;
    }

    const out: unknown = await context.bustCacheAndResetScene(settingsJson, path ?? undefined);
    return out;
  }

  /**
   * Hook for modeling-app `engineCommandManager.start` parity (scene units / stream readiness).
   * No-op until trace shows engine priming is required; see `docs/research/zoo-kcl-std-prelude-load-failure.md`.
   */
  public async primeEngineSessionForExecute(): Promise<void> {
    await Promise.resolve();
  }

  /**
   * Unsubscribes response piping and disposes owned bridge/transport handles.
   */
  public dispose(): void {
    this.unsubscribeResponsePipe?.();
    this.unsubscribeResponsePipe = undefined;
    this.bridge.dispose();
    this.transport.dispose();
    this.context = undefined;
  }
}
