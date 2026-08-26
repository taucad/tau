import type { Models } from '@kittycad/lib';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { createZooLogger } from '#zoo-logs.js';
import type { WebSocketRequest, WebSocketResponse, ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';

/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */

const commandTimeout = 30_000;
const log = createZooLogger('ZooEngineBridge');

type BridgePending = {
  resolve: (value: Uint8Array<ArrayBuffer>) => void;
  reject: (error: unknown) => void;
  timeoutTimer: NodeJS.Timeout;
  settled: Promise<void>;
};

/**
 * Wire JSON shape for `FailureWebSocketResponse` — `error_code` is wider than
 * `@kittycad/lib`'s `ErrorCode_type` because the engine and kcl-lib emit additional
 * codes at runtime (e.g. `precondition_failed`, `timeout`).
 */
type WireFailureWebSocketResponse = {
  success: false;
  errors: Array<{ error_code: string; message: string }>;
  request_id?: string;
};

/**
 * Assigns the WASM-provided UUID to a modeling command envelope.
 * Exported for contract tests — non-modeling {@link WebSocketRequest} variants throw at runtime.
 *
 * @param envelope - modeling request to mutate
 * @param id - cmd/batch id from WASM
 * @public
 */
export function assignModelingCommandRequestId(envelope: WebSocketRequest, id: string): void {
  switch (envelope.type) {
    case 'modeling_cmd_req': {
      envelope.cmd_id = id;
      return;
    }

    case 'modeling_cmd_batch_req': {
      envelope.batch_id = id;
      return;
    }

    default: {
      throw new Error(`Unexpected WebSocketRequest for modeling command id assignment: ${JSON.stringify(envelope)}`);
    }
  }
}

function createCommandSettled(): { settled: Promise<void>; markSettled: () => void } {
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  let completed = false;
  const markSettled = (): void => {
    if (completed) {
      return;
    }

    completed = true;
    resolveSettled();
  };
  return { settled, markSettled };
}

/**
 * Builds a JSON string Rust's `do_send_modeling_cmd` can parse via `serde_json::from_str`
 * into a `FailureWebSocketResponse` (see `kcl-lib` `conn_wasm.rs`).
 *
 * @param failure - wire failure envelope
 * @returns JSON text for Promise rejection / throws surfaced to WASM
 */
function stringifyFailureResponse(failure: WireFailureWebSocketResponse): string {
  return JSON.stringify(failure);
}

/**
 * Implements the `EngineCommandManager` wasm-bindgen extern: translates KCL callbacks into
 * {@link ZooWebSocketTransport} sends and resolves `send` promises from engine responses.
 * `fire` sends without tracking a local promise — KCL drains via `sendResponse` only.
 *
 * @public
 */
export class ZooEngineBridge {
  private readonly pendingCommands = new Map<string, BridgePending>();
  private readonly unsubscribeMessage: () => void;
  private readonly unsubscribeClose: () => void;
  /* oxlint-disable-next-line @typescript-eslint/parameter-properties -- explicit field: constructor parameter properties are non-erasable (TS1294 / erasableSyntaxOnly) */
  private readonly transport: ZooWebSocketTransport;

  public constructor(transport: ZooWebSocketTransport) {
    this.transport = transport;
    this.unsubscribeMessage = transport.onMessage((_raw, decoded) => {
      this.handleDecodedMessage(decoded);
    });
    this.unsubscribeClose = transport.onSocketClosed(() => {
      this.rejectAllPending({
        error_code: 'connection_problem',
        message: 'WebSocket closed',
      });
    });
  }

  /**
   * Fire-and-forget modeling command — no local promise; WASM drains via `sendResponse`.
   *
   * @param id - command id (UUID string)
   * @param _rangeString - unused range map (WASM contract)
   * @param commandString - JSON {@link WebSocketRequest} body
   * @param _idToRangeString - unused id→range map (WASM contract)
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public fireModelingCommandFromWasm(
    id: string,
    _rangeString: string,
    commandString: string,
    _idToRangeString: string,
  ): void {
    try {
      const envelope = JSON.parse(commandString) as WebSocketRequest;
      assignModelingCommandRequestId(envelope, id);
      log.req(`fire ${JSON.stringify(envelope)}`);
      this.transport.sendRaw(envelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        stringifyFailureResponse({
          success: false,
          errors: [{ error_code: 'fire_modeling_cmd_failed', message }],
        }),
      );
    }
  }

  /**
   * Awaitable modeling command — returns msgpack-encoded `WebSocketResponse` for KCL.
   *
   * @param id - command id (UUID string)
   * @param _rangeString - unused range map (WASM contract)
   * @param commandString - JSON {@link WebSocketRequest} body
   * @param _idToRangeString - unused id→range map (WASM contract)
   * @returns msgpack bytes of the engine {@link WebSocketResponse}
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public async sendModelingCommandFromWasm(
    id: string,
    _rangeString: string,
    commandString: string,
    _idToRangeString: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.transport.connected) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- JSON failure string for Rust `serde_json::from_str` in `conn_wasm`
      throw stringifyFailureResponse({
        success: false,
        errors: [
          {
            error_code: 'connection_problem',
            message: 'WebSocket not connected — call transport.initialize() first',
          },
        ],
      });
    }

    if (this.pendingCommands.has(id)) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- JSON failure string for Rust `serde_json::from_str` in `conn_wasm`
      throw stringifyFailureResponse({
        success: false,
        errors: [
          {
            error_code: 'duplicate_command',
            message: 'You are attempting to send the same command twice. Rejecting this attempt.',
          },
        ],
      });
    }

    const envelope = JSON.parse(commandString) as WebSocketRequest;
    assignModelingCommandRequestId(envelope, id);

    return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const { settled, markSettled } = createCommandSettled();
      const wrappedResolve = (value: Uint8Array<ArrayBuffer>): void => {
        resolve(value);
        markSettled();
      };
      const wrappedReject = (reason: unknown): void => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Rust expects a JSON string rejection payload, not `Error.message`
        reject(reason);
        markSettled();
      };

      const timeoutTimer = setTimeout(() => {
        if (!this.pendingCommands.has(id)) {
          return;
        }

        this.pendingCommands.delete(id);
        wrappedReject(
          stringifyFailureResponse({
            success: false,
            request_id: id,
            errors: [
              {
                error_code: 'timeout',
                message: `Timed out waiting for response to commandId: ${id}`,
              },
            ],
          }),
        );
      }, commandTimeout);

      this.pendingCommands.set(id, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        timeoutTimer,
        settled,
      });

      try {
        log.req(`send ${JSON.stringify(envelope)}`);
        this.transport.sendRaw(envelope);
      } catch (error) {
        clearTimeout(timeoutTimer);
        this.pendingCommands.delete(id);
        const sendErrorMessage = error instanceof Error ? error.message : String(error);
        wrappedReject(
          stringifyFailureResponse({
            success: false,
            request_id: id,
            errors: [{ error_code: 'send_failed', message: sendErrorMessage }],
          }),
        );
      }
    });
  }

  /**
   * Wait until every in-flight {@link sendModelingCommandFromWasm} promise has settled
   * (`Context.execute` must drain the bridge queue before returning to callers).
   */
  public async flushPending(): Promise<void> {
    const snapshots = [...this.pendingCommands.values()];
    if (snapshots.length === 0) {
      return;
    }

    await Promise.allSettled(snapshots.map(async (pendingCommand) => pendingCommand.settled));
  }

  /**
   * Session reset hook from KCL; upstream NO-OP until ProjectManager lands in Tau.
   *
   * Upstream's responseMap has zero read sites workspace-wide in modeling-app; Tau holds
   * no per-session JS state that must reset here.
   */
  public async startNewSession(): Promise<void> {
    /* Coverage: noop hook wired from WASM until Tau adopts ProjectManager */
    await Promise.resolve();
  }

  /** Reject all pending commands and detach transport listeners owned by this bridge. */
  public dispose(): void {
    this.rejectAllPending({ error_code: 'bridge_disposed', message: 'Bridge disposed' });
    this.unsubscribeMessage();
    this.unsubscribeClose();
  }

  /**
   * Reject every queued modeling command with a synthetic failure envelope so Rust's
   * `serde_json::from_str` path can decode the engine error.
   *
   * @param reason - synthetic engine failure (`error_code` + `message`)
   */
  public rejectAllPendingCommand(reason: { error_code: string; message: string }): void {
    this.rejectAllPending(reason);
  }

  private rejectAllPending(reason: { error_code: string; message: string }): void {
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeoutTimer);
      const failure: WireFailureWebSocketResponse = {
        success: false,
        request_id: requestId,
        errors: [{ error_code: reason.error_code, message: reason.message }],
      };
      // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Rust expects a JSON string rejection payload for `FailureWebSocketResponse`
      pending.reject(stringifyFailureResponse(failure));
    }

    this.pendingCommands.clear();
  }

  private handleDecodedMessage(message: WebSocketResponse): void {
    if (!message.success && message.errors[0]?.error_code === 'auth_token_missing') {
      return;
    }

    if (message.request_id) {
      const pending = this.pendingCommands.get(message.request_id);
      if (pending) {
        clearTimeout(pending.timeoutTimer);
        this.pendingCommands.delete(message.request_id);

        if (message.success) {
          switch (message.resp.type) {
            case 'export':
            case 'modeling':
            case 'modeling_batch': {
              pending.resolve(msgpackEncode(message));
              break;
            }

            default: {
              log.warn('Unknown response type:', message.resp.type);
              pending.resolve(msgpackEncode(message));
            }
          }
        } else {
          const failure: WireFailureWebSocketResponse = {
            success: false,
            request_id: message.request_id,
            errors: message.errors.map((error) => ({
              error_code: error.error_code,
              message: error.message,
            })),
          };
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Rust expects a JSON string rejection payload for `FailureWebSocketResponse`
          pending.reject(stringifyFailureResponse(failure));
        }
      }
    }

    if (message.success && message.resp.type === 'modeling_batch') {
      for (const [commandId, batchEntry] of Object.entries(message.resp.data.responses)) {
        const response = batchEntry as { response?: unknown };
        if (!('response' in response)) {
          continue;
        }

        const modelingResponse = response.response as Models['OkModelingCmdResponse_type'];
        const individualResponse = {
          success: true,
          request_id: commandId,
          resp: {
            type: 'modeling',
            data: {
              modeling_response: modelingResponse,
            },
          },
        } as const satisfies WebSocketResponse;

        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
          clearTimeout(pendingCommand.timeoutTimer);
          this.pendingCommands.delete(commandId);
          pendingCommand.resolve(msgpackEncode(individualResponse));
        }
      }

      if (message.request_id) {
        const batchCommand = this.pendingCommands.get(message.request_id);
        if (batchCommand) {
          clearTimeout(batchCommand.timeoutTimer);
          this.pendingCommands.delete(message.request_id);
          batchCommand.resolve(msgpackEncode(message));
        }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- end Kittycad wire JSON field names */
