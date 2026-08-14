import type { Context } from '@taucad/kcl-wasm-lib';
import type { WasmModule } from '#kernels/zoo/zoo-wasm-module.types.js';
import type { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import { KclError } from '#kernels/zoo/kcl-errors.js';
import { ZooEngineBridge } from '#kernels/zoo/bridge/zoo-engine-bridge.js';
import { ZooEngineSession } from '#kernels/zoo/session/zoo-engine-session.js';
import { ZooWebSocketTransport } from '#kernels/zoo/transport/zoo-websocket-transport.js';

/**
 * Stub engine surface for `Context` in mock-only mode (`executeMock`).
 * Implements the kcl-lib `EngineCommandManager` wasm extern shape.
 * @public
 */
export class MockEngineConnection {
  /**
   * Fire-and-forget — mock execution must not reach the Zoo websocket bridge.
   *
   * @param _id - Modeling command id from WASM (unused in mock).
   * @param _rangeString - JSON source range (unused).
   * @param _commandString - Serialized command (unused).
   * @param _idToRangeString - JSON id→range map (unused).
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public fireModelingCommandFromWasm(
    _id: string,
    _rangeString: string,
    _commandString: string,
    _idToRangeString: string,
  ): void {
    throw KclError.simple({
      kind: 'engine',
      message: 'Mock execution should not require websocket modeling commands (fire path)',
    });
  }

  /**
   * Awaitable command — mock execution must not reach the Zoo websocket bridge.
   *
   * @param _id - Modeling command id from WASM (unused in mock).
   * @param _rangeString - JSON source range (unused).
   * @param _commandString - Serialized command (unused).
   * @param _idToRangeString - JSON id→range map (unused).
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public async sendModelingCommandFromWasm(
    _id: string,
    _rangeString: string,
    _commandString: string,
    _idToRangeString: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    throw KclError.simple({
      kind: 'engine',
      message: 'Mock execution should not require websocket modeling commands',
    });
  }

  /**
   * Session reset hook from upstream; the mock context does not model projects yet.
   *
   * @returns Resolves when the no-op completes.
   */
  public async startNewSession(): Promise<void> {
    /* No-op until Tau adopts ProjectManager. */
  }
}

/**
 * Connects KCL WASM to the Zoo modeling WebSocket API (transport + bridge + session).
 * @public
 */
export class EngineConnection {
  private readonly baseUrl: string;
  private readonly closeErrors: Record<string, string> | undefined;
  private readonly token: string | undefined;
  private readonly wasmModule: WasmModule;
  private readonly fileSystemManager: FileSystemManager;

  private session: ZooEngineSession | undefined;

  public constructor(options: {
    baseUrl: string;
    closeErrors?: Record<string, string>;
    token?: string;
    wasmModule: WasmModule;
    fileSystemManager: FileSystemManager;
  }) {
    this.baseUrl = options.baseUrl;
    this.closeErrors = options.closeErrors;
    this.token = options.token;
    this.wasmModule = options.wasmModule;
    this.fileSystemManager = options.fileSystemManager;
  }

  /**
   * Live WASM context when this connection has completed {@link initialize}.
   *
   * @returns The bound `Context`, or `undefined` before init or after {@link cleanup}.
   */
  public get context(): Context | undefined {
    return this.session?.context;
  }

  /**
   * Engine bridge for the active session (modeling command serialization to the transport).
   *
   * @returns The bridge for the open session, or undefined before init / after cleanup.
   */
  public get bridge(): ZooEngineBridge | undefined {
    return this.session?.bridge;
  }

  /**
   * Subscribe to modeling WebSocket close after a successful {@link initialize}. If there is no session yet, returns a no-op unsubscriber.
   *
   * @param handler - Invoked once when the socket closes or errors after open.
   * @returns Unsubscribe function.
   */
  public onSessionClosed(handler: () => void): () => void {
    if (!this.session) {
      return () => {
        /* No session */
      };
    }

    return this.session.transport.onSocketClosed(handler);
  }

  /**
   * Opens the WebSocket, completes auth, and constructs the WASM `Context` bound to this connection’s bridge.
   */
  public async initialize(): Promise<void> {
    if (this.session) {
      await this.cleanup();
    }

    const transport = new ZooWebSocketTransport({
      baseUrl: this.baseUrl,
      closeErrors: this.closeErrors,
      token: this.token,
    });
    const bridge = new ZooEngineBridge(transport);
    await transport.initialize();
    const session = new ZooEngineSession({
      transport,
      bridge,
      fileSystemManager: this.fileSystemManager,
      wasmModule: this.wasmModule,
    });
    await session.openContext();
    await session.primeEngineSessionForExecute();

    this.session = session;
  }

  /**
   * Closes the socket, disposes the bridge, and drops the WASM context.
   */
  public async cleanup(): Promise<void> {
    this.session?.dispose();
    this.session = undefined;
  }
}
