/**
 * WebSocket Transport Types
 *
 * This file contains types for WebSocket message transport only.
 * Tool-specific types are in tool.types.ts.
 * RPC protocol types are in rpc.types.ts.
 */
import type { RpcName } from '#types/rpc.types.js';
import type { RpcInput, RpcResult } from '#schemas/rpc.schema.js';
import type { ChatRpcProtocolErrorCode } from '#schemas/rpc-wire-protocol.schema.js';
import type { wsCloseCode } from '#constants/websocket.constants.js';

/** @public */
export type WsCloseCode = (typeof wsCloseCode)[keyof typeof wsCloseCode];

/**
 * Server → client RPC request, discriminated by `rpcName` so `args` narrows with the method
 * (mirrors `RpcCall` plus transport metadata).
 * @public
 */
export type RpcRequest<K extends RpcName = RpcName> = {
  [P in K]: {
    type: 'rpc_request';
    /** The chat ID this request is for */
    chatId: string;
    /** Unique ID for this request (used to match response) */
    requestId: string;
    /** The tool call ID from the LLM */
    toolCallId: string;
    /** The name of the RPC operation to execute */
    rpcName: P;
    /** The arguments for the RPC operation */
    args: RpcInput<P>;
    /** W3C trace context for distributed tracing propagation */
    traceContext?: Record<string, string>;
  };
}[K];

/**
 * Client -> Server: Result of an RPC operation execution (success path).
 * Discriminated on `rpcName` so payloads narrow with the mirrored request.
 * @public
 */
export type RpcResponseSuccess<T extends RpcName> = {
  type: 'rpc_response';
  rpcName: T;
  /** The request ID this response corresponds to */
  requestId: string;
  /** The tool call ID from the original request */
  toolCallId: string;
  /** The result of the RPC operation */
  result: RpcResult<T>;
  /** W3C trace context echoed back from client for distributed tracing */
  traceContext?: Record<string, string>;
};

/**
 * Client -> Server: Result of an RPC operation execution (client-side failure path).
 * @public
 */
export type RpcResponseError<T extends RpcName> = {
  type: 'rpc_response';
  rpcName: T;
  requestId: string;
  toolCallId: string;
  result: undefined;
  /** Error message if the RPC operation failed before producing a structured result */
  error: string;
  traceContext?: Record<string, string>;
};

/**
 * Client -> Server: Result of an RPC operation execution for one method.
 * @public
 */
export type RpcResponseFor<T extends RpcName> = RpcResponseSuccess<T> | RpcResponseError<T>;

/**
 * Builds a correlated success ack for the wire after handler execution.
 *
 * @public
 */
export function rpcWireSuccessResponse<K extends RpcName>(request: RpcRequest<K>, result: RpcResult<K>): RpcResponse {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- widen RpcResponseFor<K> to wire union for Socket.IO ack typing
  return {
    type: 'rpc_response',
    rpcName: request.rpcName,
    requestId: request.requestId,
    toolCallId: request.toolCallId,
    result,
    ...(request.traceContext === undefined ? {} : { traceContext: request.traceContext }),
  } as RpcResponse;
}

/**
 * Client -> Server: Result of an RPC operation execution (all methods).
 * @public
 */
export type RpcResponse = { [K in RpcName]: RpcResponseFor<K> }[RpcName];

/** @public */
export type ChatRpcJoinMessage = {
  /** The chat ID to associate with this connection. */
  chatId: string;
  /** Shared browser/API wire-protocol version. */
  rpcProtocolVersion: string;
};

/** @public */
export type ChatRpcJoinAck =
  | {
      success: true;
      rpcProtocolVersion: string;
    }
  | {
      success: false;
      code?: ChatRpcProtocolErrorCode | string;
      message?: string;
      expectedProtocolVersion?: string;
      receivedProtocolVersion?: string;
    };

/**
 * Server -> Client: Error message.
 * @public
 */
export type WsErrorMessage = {
  type: 'error';
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
};

/**
 * All possible messages from server to client.
 * @public
 */
export type ServerToClientMessage = RpcRequest | WsErrorMessage;

/**
 * All possible messages from client to server.
 * @public
 */
export type ClientToServerMessage = RpcResponse | ChatRpcJoinMessage;
