// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { parseEventLog, serializeLogEvent } from '#log/serialization.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { reduceEventLog } from '#log/reducer.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export {
  agentLogEventSchema,
  jsonValueSchema,
  parseLogEvent,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { createAgentSession, createTransportStreamFunction } from '#harness/session.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { createTauAgentHost } from '#host/tau-agent-host.js';
/* The daemon channel vocabulary. Zod only — the WebSocket client half validates
 * against these same schemas inside a browser bundle, so they must not ride the
 * Node-only `/node-launcher` subpath. */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export {
  admissionConfigFor,
  agentChannelAdmissionConfigSchema,
  agentChannelCommandSchema,
  agentChannelEventSchema,
  agentChannelLiveEventSchema,
  agentChannelProtocolSchemas,
  agentChannelResponseSchema,
  agentChannelTailBatchLimit,
} from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  AgentChannelAdmissionConfig,
  AgentChannelCommand,
  AgentChannelEvent,
  AgentChannelLeadership,
  AgentChannelLiveEvent,
  AgentChannelProtocol,
  AgentChannelResponse,
  AgentChannelResultOperation,
} from '#launchers/node/agent-wire.js';
/* The transport union and its close vocabulary. Types only — the client half
 * itself ships from `@taucad/agent-host/channel-client`. */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { AgentChannelClient, AgentChannelCloseReason } from '#channel/agent-channel-client.js';
/* R3: apps never import `@taucad/rpc`, so the few channel types an app needs to
 * declare its own worker protocol are re-exported from here. */
export type { Channel, ChannelServer, ChannelServerHandle, WireProtocolSchemas, WithTransferables } from '@taucad/rpc';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export {
  GatewayModelTransportError,
  createCachedSystemPromptBlocks,
  createGatewayModelTransport,
  gatewayModelErrorCodes,
  isGatewayProviderKind,
  isOpenAiGatewayProviderKind,
} from '#transport/gateway-model-transport.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { normalizeLatexDelimiters, trimToolResultContext } from '#harness/cad-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { HostCompactionError } from '#harness/compaction.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { canonicalJson, defaultSafeguardThresholds, summarizeToolEvents } from '#harness/safeguards.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { normalizeToolInput, toPiToolContent } from '#harness/tools.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { EventLogErrorCode } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { EventLogAppender, EventLogAppendOutcome, EventLogBatch } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  AgentLogEvent,
  AgentToolChoice,
  AssistantProviderMessage,
  HistoryCompactedEvent,
  HistoryRewoundEvent,
  InterruptRecordedEvent,
  JsonObject,
  JsonValue,
  LogEventBase,
  ModelSystemPromptBlock,
  ModelProviderKind,
  MessageAppendedEvent,
  MessageEnvelopeReplacedEvent,
  ProviderMessage,
  ProviderMessageMetadata,
  RunLifecycleEvent,
  RunTrigger,
  RunLifecycleState,
  SafeguardRecordedEvent,
  SnapshotContextRefreshedEvent,
  StorageDurabilityClass,
  ToolInputProviderMessage,
  ToolOutputProviderMessage,
  TurnContextSnapshot,
  TurnModelConfig,
  TurnHistoryProjectionCommittedEvent,
  UserProviderMessage,
} from '#log/event-types.js';
export { modelProviderKinds, storageDurabilityClasses } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { PromptCacheControl } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  DurableEventLog,
  AgentLiveEvent,
  HostRun,
  HostRunFailure,
  HostRunSnapshot,
  HostToolDefinition,
  HostToolInvocation,
  HostToolResult,
  InterruptApprovalPort,
  InterruptRequest,
  InterruptResolution,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  RunLifecycleCommands,
  ToolRegistry,
} from '#waist/ports.js';
export type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { ModelCallMiddleware, ModelCallRequest } from '#harness/model-call-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { ClientContext, ClientSkill, RecentSkill, RecentSkillsPort } from '#harness/cad-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  AnomalyPattern,
  SafeguardDetection,
  SafeguardOutcome,
  SafeguardThresholds,
  ToolEventSummary,
} from '#harness/safeguards.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { AgentSession, AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  CreateTauAgentHostOptions,
  ExternalAgentLogEvent,
  ExternalAgentPort,
  ExternalAgentTurn,
  ExternalRunKind,
  TauAgentAdmissionConfig,
  TauAgentHost,
  TauAgentTurnRequest,
} from '#host/tau-agent-host.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  CachedSystemPromptOptions,
  GatewayModelErrorCode,
  GatewayModelTransportOptions,
} from '#transport/gateway-model-transport.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { HostToolExecutionDetails, ToolResultSubstituter } from '#harness/tools.js';
