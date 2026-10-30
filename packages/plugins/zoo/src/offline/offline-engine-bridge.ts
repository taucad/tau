import { encode as msgpackEncode } from '@msgpack/msgpack';
import { createZooLogger } from '#zoo-logs.js';
import type { OfflineEngine } from '#offline/offline-engine.js';
import type { ModelingCommand, ModelingResponse } from '#offline/offline-engine.types.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';

/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */

const log = createZooLogger('OfflineEngineBridge');

type ModelingCmdRequest = { type: 'modeling_cmd_req'; cmd: ModelingCommand; cmd_id: string };
type ModelingBatchRequest = {
  type: 'modeling_cmd_batch_req';
  requests: Array<{ cmd: ModelingCommand; cmd_id: string }>;
  batch_id: string;
  responses: boolean;
};
type OfflineWebSocketRequest = ModelingCmdRequest | ModelingBatchRequest;

type WireError = { error_code: string; message: string };

type BatchEntry = { response: ModelingResponse } | { errors: WireError[] };

/** Receives fire-and-forget responses: `Context.sendResponse` in the WASM session. */
export type OfflineResponseSink = (bytes: Uint8Array<ArrayBuffer>) => Promise<void> | void;

function toWireError(error: unknown): WireError {
  if (error instanceof OfflineEngineError) {
    return { error_code: error.code, message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { error_code: 'internal_engine', message };
}

/**
 * Implements the kcl-lib `EngineCommandManager` wasm extern against the in-process {@link OfflineEngine}.
 *
 * The online bridge serialises each request onto the Zoo WebSocket; this bridge runs each modeling command
 * against libcascade synchronously and answers with the same msgpack `WebSocketResponse` the engine would send,
 * so kcl-lib cannot tell the difference.
 *
 * @public
 */
export class OfflineEngineBridge {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly engine: OfflineEngine;
  private responseSink: OfflineResponseSink | undefined;
  private readonly pendingFires = new Set<Promise<void>>();

  public constructor(engine: OfflineEngine) {
    this.engine = engine;
  }

  /**
   * Route fire-and-forget responses into the WASM context once it exists.
   *
   * @param sink - Receives msgpack responses for fired commands.
   */
  public setResponseSink(sink: OfflineResponseSink): void {
    this.responseSink = sink;
  }

  /**
   * Fire-and-forget modeling command: run it now and push the response through the sink, where kcl-lib polls for it.
   *
   * @param id - command id (UUID string)
   * @param _rangeString - unused source range (WASM contract)
   * @param commandString - JSON `WebSocketRequest`
   * @param _idToRangeString - unused id-to-range map (WASM contract)
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public fireModelingCommandFromWasm(
    id: string,
    _rangeString: string,
    commandString: string,
    _idToRangeString: string,
  ): void {
    const request = JSON.parse(commandString) as OfflineWebSocketRequest;
    const response = this.run(request, id);
    const sink = this.responseSink;
    if (!sink) {
      return;
    }

    const bytes = msgpackEncode(response);
    // Deliver after the current WASM call returns: kcl-lib holds its context borrowed while it fires.
    const deliver = async (): Promise<void> => {
      await Promise.resolve();
      try {
        await sink(bytes);
      } finally {
        this.pendingFires.delete(delivery);
      }
    };
    const delivery = deliver();
    this.pendingFires.add(delivery);
  }

  /**
   * Awaitable modeling command: returns msgpack bytes, or rejects with the failure JSON kcl-lib parses.
   *
   * @param id - command or batch id (UUID string)
   * @param _rangeString - unused source range (WASM contract)
   * @param commandString - JSON `WebSocketRequest`
   * @param _idToRangeString - unused id-to-range map (WASM contract)
   * @returns msgpack-encoded `WebSocketResponse`
   */
  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` uses four positional parameters
  public async sendModelingCommandFromWasm(
    id: string,
    _rangeString: string,
    commandString: string,
    _idToRangeString: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const request = JSON.parse(commandString) as OfflineWebSocketRequest;
    const response = this.run(request, id);
    if (!response.success) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Rust parses a JSON `FailureWebSocketResponse` string
      throw JSON.stringify(response);
    }

    return msgpackEncode(response);
  }

  /** Session reset hook from kcl-lib; scene reset arrives as `scene_clear_all`. */
  public async startNewSession(): Promise<void> {
    await Promise.resolve();
  }

  /** Wait until every fired response has reached the WASM context. */
  public async flushPending(): Promise<void> {
    await Promise.allSettled(this.pendingFires);
  }

  /**
   * Cancellation has nothing to reject: commands run synchronously, so the next command observes the abort.
   *
   * @param reason - synthetic failure that the online bridge would deliver
   */
  public rejectAllPendingCommand(reason: WireError): void {
    this.engine.interrupt(reason.message);
  }

  /** Drop the sink; the engine owns its libcascade handles. */
  public dispose(): void {
    this.responseSink = undefined;
  }

  private run(
    request: OfflineWebSocketRequest,
    id: string,
  ):
    | { success: true; request_id: string; resp: unknown }
    | { success: false; request_id: string; errors: WireError[] } {
    switch (request.type) {
      case 'modeling_cmd_req': {
        try {
          const modelingResponse = this.engine.execute(id, request.cmd);
          // Export answers as its own WebSocket response type, not as a modeling response.
          const resp =
            request.cmd.type === 'export'
              ? { type: 'export', data: modelingResponse.data }
              : { type: 'modeling', data: { modeling_response: modelingResponse } };
          return { success: true, request_id: id, resp };
        } catch (error) {
          log.warn(`offline command ${request.cmd.type} failed`, error);
          return { success: false, request_id: id, errors: [toWireError(error)] };
        }
      }

      case 'modeling_cmd_batch_req': {
        const responses: Record<string, BatchEntry> = {};
        for (const entry of request.requests) {
          try {
            responses[entry.cmd_id] = { response: this.engine.execute(entry.cmd_id, entry.cmd) };
          } catch (error) {
            log.warn(`offline batch command ${entry.cmd.type} failed`, error);
            responses[entry.cmd_id] = { errors: [toWireError(error)] };
            // The engine stops a batch at the first failure; later commands depend on the failed one.
            break;
          }
        }

        return {
          success: true,
          request_id: id,
          resp: { type: 'modeling_batch', data: { responses } },
        };
      }

      default: {
        const unknownRequest: { type: string } = request;
        return {
          success: false,
          request_id: id,
          errors: [{ error_code: 'bad_request', message: `Unsupported offline request ${unknownRequest.type}` }],
        };
      }
    }
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- end Kittycad wire JSON field names */
