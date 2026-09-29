/**
 * Typed RPC channel primitives for postMessage-style transports
 * (browser workers, Electron `MessagePortMain`, `node:worker_threads`).
 *
 * Wire format and protocol semantics are normative in
 * {@link ../../../docs/architecture/rpc-wire-spec.md}.
 */

export type { Codec, MessagePortLike, MessagePortMainLike, Port, WebSocketLike } from '#port.js';
export { wrapMessagePort, wrapMessagePortMain, wrapWebSocket } from '#port.js';

export type {
  Channel,
  ChannelClientOptions,
  ChannelContext,
  ChannelServer,
  ChannelServerHandle,
  ChannelServerOptions,
  EmptyRpcProtocol,
  StreamFlowControlOptions,
  WithTransferables,
} from '#channel.js';
export {
  __resetFlowControlWarnings,
  createChannelClient,
  createChannelClientOptions,
  createChannelServer,
  createChannelServerOptions,
} from '#channel.js';
export { ChannelClosedError } from '#channel-closed-error.js';
export type { ChannelCloseCode, CloseInfo } from '#channel-closed-error.js';
export type { RpcProtocol } from '#protocol.js';

export type {
  WireBye,
  WireError,
  WireFlowAck,
  WireFlowWindow,
  WireHello,
  WireHelloError,
  WireHelloOk,
  WireKeepalive,
  WireMessage,
  WireNotify,
  WireRequest,
  WireRequestCancel,
  WireResponse,
  WireResponseError,
  WireResponseOk,
  WireStreamComplete,
  WireStreamError,
  WireStreamNext,
  WireStreamSubscribe,
  WireStreamUnsubscribe,
  WireVersionMismatchDiagnostic,
  WireVersionMismatchHandler,
} from '#wire.js';
export { isWireMessage, wireVersion } from '#wire.js';

export { traceFrame, type TraceLogger, type TraceDirection } from '#trace.js';

export {
  WireValidationError,
  isWireValidationError,
  type WireValidationIssue,
  type WireValidationResult,
  type WireValidationSite,
  type WireValidator,
  type WireProtocolSchemas,
} from '#wire-validation-error.js';
