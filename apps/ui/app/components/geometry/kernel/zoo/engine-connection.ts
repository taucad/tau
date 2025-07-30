/* eslint-disable @typescript-eslint/parameter-properties -- parameter properties are non-erasable TypeScript */
import type { Models } from '@kittycad/lib';
import type { Context } from '@taucad/kcl-wasm-lib';
import { BSON } from 'bson';
import { binaryToUuid } from '#utils/binary.js';
import { KclError, KclAuthError } from '#components/geometry/kernel/zoo/kcl-errors.js';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- required
export type WasmModule = typeof import('@taucad/kcl-wasm-lib');

export type FileSystemManager = {
  dir: string;
  join(path: string, ...paths: string[]): string;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  getAllFiles(): Promise<string[]>;
};

export type WebSocketRequest = Models['WebSocketRequest_type'];
export type WebSocketResponse = Models['WebSocketResponse_type'];

type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout;
};

type InitializationContext = {
  resolve: (value: void) => void;
  reject: (error: unknown) => void;
  resolved: boolean;
  authTimeoutId: NodeJS.Timeout;
};

const authTimeout = 10_000; // 10 second timeout
const commandTimeout = 30_000; // 30 second timeout

const consoleColors = {
  info: '\u001B[32m',
  error: '\u001B[31m',
  warn: '\u001B[33m',
  debug: '\u001B[34m',
  trace: '\u001B[35m',
  req: '\u001B[36m',
  res: '\u001B[36m',
};

const clg = {
  info(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.info}[INFO]\u001B[0m : ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.error}[ERROR]\u001B[0m: ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.warn}[WARN]\u001B[0m: ${message}`, ...args);
  },
  debug(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.debug}[DEBUG]\u001B[0m: ${message}`, ...args);
  },
  trace(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.trace}[TRACE]\u001B[0m: ${message}`, ...args);
  },
  req(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.req}[REQ]\u001B[0m  : ${message}`, ...args);
  },
  res(message: string, ...args: unknown[]): void {
    console.log(`${consoleColors.res}[RES]\u001B[0m  : ${message}`, ...args);
  },
};

// Isomorphic WebSocket implementation that works in both Node.js and browser
const getWebSocket = async (): Promise<typeof WebSocket> => {
  if (typeof WebSocket !== 'undefined') {
    // Browser environment
    return WebSocket;
  }

  // Node.js environment - try to import ws package
  try {
    const ws = await import('ws');
    return ws.WebSocket as unknown as typeof WebSocket;
  } catch {
    throw new Error('WebSocket not available. In Node.js, install the "ws" package: npm install ws');
  }
};

// Mock engine connection for local operations that don't need websocket
export class MockEngineConnection {
  public async sendModelingCommandFromWasm(): Promise<Uint8Array> {
    throw KclError.simple('engine', 'Mock execution should not require websocket commands');
  }

  public async startNewSession(): Promise<void> {
    // NO-OP for mock
  }

  public async startFromWasm(): Promise<boolean> {
    return true;
  }
}

// Standalone WebSocket engine connection
export class EngineConnection {
  public context: Context | undefined;
  private websocket: WebSocket | undefined;
  private isConnected = false;
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly wasmModule: WasmModule;
  private pingIntervalId: NodeJS.Timeout | undefined;
  private initializationContext: InitializationContext | undefined;

  public constructor(apiKey: string, baseUrl: string, wasmModule: WasmModule) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.wasmModule = wasmModule;
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let authTimeoutId: NodeJS.Timeout;

      const initializeAsync = async (): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/await-thenable -- await is required here.
        this.context = await new this.wasmModule.Context(
          this,
          undefined, // Fs_manager (undefined for now)
        );

        try {
          const url = new URL('/ws/modeling/commands', this.baseUrl);
          url.searchParams.set('video_res_width', '256');
          url.searchParams.set('video_res_height', '256');

          // eslint-disable-next-line @typescript-eslint/naming-convention -- must use PascalCase for class.
          const WebSocketClass = await getWebSocket();
          this.websocket = new WebSocketClass(url);
          this.websocket.binaryType = 'arraybuffer';

          // Set up auth timeout
          authTimeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              reject(new KclAuthError('Authentication timeout', 408));
            }
          }, authTimeout);

          // Store initialization context
          this.initializationContext = {
            resolve,
            reject,
            resolved,
            authTimeoutId,
          };

          // Add event listeners
          this.websocket.addEventListener('open', this.onWebSocketOpen);
          this.websocket.addEventListener('close', this.onWebSocketClose);
          this.websocket.addEventListener('error', this.onWebSocketError);
          this.websocket.addEventListener('message', this.onWebSocketMessage);
        } catch (error) {
          if (!resolved) {
            resolved = true;
            clearTimeout(authTimeoutId);
            reject(KclError.simple('io', String(error)));
          }
        }
      };

      void initializeAsync();
    });
  }

  // Send a modeling command from WASM. This method is called by the WASM context.
  public async sendModelingCommandFromWasm(
    _commandString: string,
    _id: string,
    cmd: string,
    _pathString: string,
  ): Promise<Uint8Array> {
    if (!this.isConnected) {
      // If the connection is not connected, we need to cleanup and re-initialize.
      // This lazy initialization ensures we only create and use a connection when it's required.
      await this.cleanup();
      await this.initialize();
    }

    try {
      const modelingCommand = JSON.parse(cmd) as WebSocketRequest;

      const response = (await this.sendCommand(modelingCommand)) as WebSocketResponse;

      return BSON.serialize(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      throw KclError.simple('engine', errorMessage);
    }
  }

  public async startNewSession(): Promise<void> {
    // This is called by the WASM context to start a new session.
    // WASM requires it to be present.
    // NO-OP for now.
  }

  public async startFromWasm(_token: string): Promise<boolean> {
    // This is called by the WASM context to start the engine connection
    return this.isConnected;
  }

  public async cleanup(): Promise<void> {
    // Clear ping interval
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }

    // Clear all pending commands
    for (const [_id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(KclError.simple('io', 'Connection closed'));
    }

    this.pendingCommands.clear();

    if (this.websocket) {
      // Remove all event listeners before closing
      this.websocket.removeEventListener('open', this.onWebSocketOpen);
      this.websocket.removeEventListener('close', this.onWebSocketClose);
      this.websocket.removeEventListener('error', this.onWebSocketError);
      this.websocket.removeEventListener('message', this.onWebSocketMessage);

      this.websocket.close();
      this.websocket = undefined;
    }

    this.isConnected = false;
  }

  // Store event listeners as arrow functions so they can be properly removed
  private readonly onWebSocketOpen = (_event: Event): void => {
    clg.debug('WebSocket connected');

    // Send authentication headers in the exact format expected by the server
    if (this.websocket?.readyState === 1) {
      this.send({
        type: 'headers',
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- this is the expected signature.
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
    }
  };

  private readonly onWebSocketClose = (_event: CloseEvent): void => {
    clg.debug('WebSocket disconnected');
    this.isConnected = false;

    // Remove all event listeners
    if (this.websocket) {
      this.websocket.removeEventListener('open', this.onWebSocketOpen);
      this.websocket.removeEventListener('close', this.onWebSocketClose);
      this.websocket.removeEventListener('error', this.onWebSocketError);
      this.websocket.removeEventListener('message', this.onWebSocketMessage);
    }

    // Clear ping interval
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }

    // Handle initialization rejection if not yet resolved
    const initContext = this.initializationContext;
    if (initContext && !initContext.resolved) {
      initContext.resolved = true;
      clearTimeout(initContext.authTimeoutId);
      initContext.reject(new KclAuthError('Invalid Zoo API key. Please check that your Zoo API key is correct.', 401));
    }

    void this.cleanup();
  };

  private readonly onWebSocketError = (event: Event): void => {
    clg.error('WebSocket error:', event);

    const initContext = this.initializationContext;
    if (initContext && !initContext.resolved) {
      initContext.resolved = true;
      clearTimeout(initContext.authTimeoutId);

      if (event.target instanceof WebSocket) {
        const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][event.target.readyState] ?? 'UNKNOWN';
        initContext.reject(KclError.simple('io', `WebSocket error in state: ${readyStateText}`));
      } else {
        initContext.reject(KclError.simple('io', 'WebSocket connection failed'));
      }
    }
  };

  private readonly onWebSocketMessage = (event: MessageEvent): void => {
    this.handleMessage(event);
  };

  private async sendCommand(command: WebSocketRequest): Promise<unknown> {
    clg.req(JSON.stringify(command, null, 2));

    // Create promise and store in pendingCommands
    const { promise, resolve, reject } = this.createPromise();
    // Handle both individual commands (cmd_id) and batch commands (batch_id)
    const commandId =
      'cmd_id' in command ? command.cmd_id : 'batch_id' in command ? command.batch_id : this.generateRequestId();

    this.pendingCommands.set(commandId, {
      resolve,
      reject,
      timeout: setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(KclError.simple('engine', `Timed out waiting for response to commandId: ${commandId}`));
      }, commandTimeout),
    });

    this.send(command);
    return promise;
  }

  private createPromise(): {
    promise: Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  } {
    let resolve: (value: unknown) => void;
    let reject: (error: unknown) => void;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    return { promise, resolve: resolve!, reject: reject! };
  }

  // eslint-disable-next-line complexity -- this is a complex function.
  private handleMessage(event: MessageEvent): void {
    // Handle binary messages (BSON-serialized responses)
    let message: WebSocketResponse;

    if (event.data instanceof ArrayBuffer) {
      // BSON deserialize the command (same as reference implementation)
      message = BSON.deserialize(new Uint8Array(event.data)) as WebSocketResponse;
      // The request id comes back as binary and we want to get the uuid
      // string from that.
      message.request_id &&= binaryToUuid(message.request_id);
      clg.debug('Received binary BSON message, deserialized successfully');
    } else if (typeof event.data === 'string') {
      message = JSON.parse(event.data) as WebSocketResponse;
    } else {
      clg.warn('Received unknown message type:', typeof event.data);
      return;
    }

    clg.res('Received message:', message.request_id);

    // Handle authentication success
    const initContext = this.initializationContext;
    if (
      initContext &&
      !initContext.resolved &&
      'success' in message &&
      message.success &&
      message.resp.type === 'modeling_session_data'
    ) {
      clg.debug('Authentication successful');
      initContext.resolved = true;
      this.isConnected = true;
      clearTimeout(initContext.authTimeoutId);
      initContext.resolve();
    }

    // Send the response to WASM context
    if (this.context) {
      try {
        void this.context.sendResponse(BSON.serialize(message as Record<string, unknown>));
      } catch (error) {
        clg.error('Error sending response to WASM:', error);
      }
    }

    if (message.request_id) {
      const pending = this.pendingCommands.get(message.request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.request_id);

        if (message.success) {
          // Handle different response types - export responses have a different format
          switch (message.resp.type) {
            case 'export': {
              pending.resolve(message);
              break;
            }

            case 'modeling': {
              pending.resolve(message);
              break;
            }

            case 'modeling_batch': {
              pending.resolve(message);
              break;
            }

            default: {
              clg.warn('Unknown response type:', message.resp.type);
              pending.resolve(message);
            }
          }
        } else {
          const errorMessage = message.errors
            .map((error: { error_code: string; message: string }) => `${error.error_code}: ${error.message}`)
            .join(', ');
          pending.reject(KclError.simple('engine', errorMessage));
        }
      }
    }

    if (message.success && message.resp.type === 'modeling_batch') {
      clg.debug('Processing batch response with individual commands...');

      // Process each individual response in the batch
      for (const [commandId, response] of Object.entries(message.resp.data.responses)) {
        if (typeof response !== 'object' || !('response' in response)) {
          continue;
        }

        // Create individual response message for this command
        const individualResponse = {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- this is the expected signature.
          request_id: commandId,
          resp: {
            type: 'modeling',
            data: {
              // eslint-disable-next-line @typescript-eslint/naming-convention -- this is the expected signature.
              modeling_response: response.response,
            },
          },
        } as const satisfies WebSocketResponse;

        // Process this individual response
        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
          clg.debug(`Resolving batch command: ${commandId}`);
          clearTimeout(pendingCommand.timeout);
          this.pendingCommands.delete(commandId);
          pendingCommand.resolve(individualResponse);
        }
      }

      // ALSO resolve the batch command itself if it has a request_id
      if (message.request_id) {
        const batchCommand = this.pendingCommands.get(message.request_id);
        if (batchCommand) {
          clg.debug(`Resolving batch request: ${message.request_id}`);
          clearTimeout(batchCommand.timeout);
          this.pendingCommands.delete(message.request_id);
          batchCommand.resolve(message);
        } else {
          clg.warn(`Batch request ${message.request_id} not found in pending commands`);
          const pendingCommands = [...this.pendingCommands.keys()];
          clg.warn(
            `Current pending commands: ${pendingCommands.length} pending commands: ${pendingCommands.join(', ')}`,
          );
        }
      }
    }

    if (!message.success) {
      // The engine always sends auth_token_missing regardless of whether the auth handshake succeeds.
      // This appears to be a bug in the auth handshake.
      // TODO: Remove this once the auth handshake is fixed.
      if (message.errors[0]?.error_code === 'auth_token_missing') {
        clg.debug('Received auth_token_missing - ignoring as auth may succeed later');
        return;
      }

      const errorsString = message.errors
        .map((error) => {
          return `  - ${error.error_code}: ${error.message}`;
        })
        .join('\n');
      clg.error(errorsString);
      if (message.request_id) {
        const pendingCommand = this.pendingCommands.get(message.request_id);
        clg.error(
          `Error in response to request ${message.request_id}:\n${errorsString}\n\nPending command:\n${JSON.stringify(
            pendingCommand,
            null,
            2,
          )}`,
        );
      } else {
        clg.error(`Error from server:\n${errorsString}`);
      }
    }
  }

  private send(message: WebSocketRequest): void {
    clg.req(JSON.stringify(message, null, 2));
    if (this.websocket && this.websocket.readyState === 1) {
      this.websocket.send(JSON.stringify(message));
    } else {
      throw KclError.simple('io', 'WebSocket not connected');
    }
  }

  private generateRequestId(): string {
    return crypto.randomUUID();
  }
}
