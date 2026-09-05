/**
 * Tool-RPC wire vocabulary.
 *
 * Mode-neutral by construction (durability T0 ruling §4): a tool executes
 * against the workspace in every placement, so these shapes describe the
 * request/response pair itself and name no transport. The Socket.IO chat-RPC
 * protocol and its lease-fencing envelopes that used to live here left with the
 * API's chat plane (W4-PASEO).
 *
 * Tool-specific types are in tool.types.ts; RPC method names in rpc.types.ts.
 */
import type { RpcName } from '#types/rpc.types.js';
import type { RpcInput, RpcResult } from '#schemas/rpc.schema.js';
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
 * Client -> Server: Result of an RPC operation execution (all methods).
 * @public
 */
export type RpcResponse = { [K in RpcName]: RpcResponseFor<K> }[RpcName];
