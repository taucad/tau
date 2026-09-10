export { EventLogError } from '#log/event-log-error.js';
export { parseEventLog, serializeLogEvent } from '#log/serialization.js';
export { reduceEventLog } from '#log/reducer.js';
export {
  agentLogEventSchema,
  jsonValueSchema,
  parseLogEvent,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
export { createAgentSession, createTransportStreamFunction } from '#harness/session.js';
export { createTauAgentHost } from '#host/tau-agent-host.js';
/* The daemon channel vocabulary. Zod only — the WebSocket client half validates
 * against these same schemas inside a browser bundle, so they must not ride the
 * Node-only `/node-launcher` subpath. */
export {
  admissionConfigFor,
  agentChannelAdmissionConfigSchema,
  agentChannelCommandSchema,
  agentChannelEventSchema,
  agentChannelLiveEventSchema,
  agentChannelModelCostSchema,
  agentChannelModelSchema,
  agentChannelProtocolSchemas,
  agentChannelResponseSchema,
  agentChannelSystemPromptBlockSchema,
  agentChannelTailBatchLimit,
  agentChannelToolChoiceSchema,
  externalAgentAuthMethodSchema,
  externalAgentDescriptorSchema,
  externalAgentLoginSchema,
  externalAgentRefusalCodes,
} from '#launchers/node/agent-wire.js';
export type {
  AgentChannelAdmissionConfig,
  AgentChannelCommand,
  AgentChannelEvent,
  AgentChannelLeadership,
  AgentChannelLiveEvent,
  AgentChannelProtocol,
  AgentChannelResponse,
  AgentChannelResultOperation,
  ExternalAgentDescriptor,
  ExternalAgentLogin,
  ExternalAgentRefusalCode,
} from '#launchers/node/agent-wire.js';
/* The transport union and its close vocabulary. Types only — the client half
 * itself ships from `@taucad/agent-host/channel-client`. */
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
export type { AgentChannelClient, AgentChannelCloseReason } from '#channel/agent-channel-client.js';
/* R3: apps never import `@taucad/rpc`, so the few channel types an app needs to
 * declare its own worker protocol are re-exported from here. */
export type { Channel, ChannelServer, ChannelServerHandle, WireProtocolSchemas, WithTransferables } from '@taucad/rpc';
export {
  GatewayModelTransportError,
  createCachedSystemPromptBlocks,
  createGatewayModelTransport,
  gatewayModelErrorCodes,
  isGatewayProviderKind,
  isOpenAiGatewayProviderKind,
} from '#transport/gateway-model-transport.js';
export { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
export { normalizeLatexDelimiters, trimToolResultContext } from '#harness/cad-middleware.js';
export { HostCompactionError } from '#harness/compaction.js';
export { canonicalJson, defaultSafeguardThresholds, summarizeToolEvents } from '#harness/safeguards.js';
export { normalizeToolInput, tauToolKinds, toPiToolContent } from '#harness/tools.js';
export type { EventLogErrorCode } from '#log/event-log-error.js';
export type { EventLogAppender, EventLogAppendOutcome, EventLogBatch } from '#log/event-log-appender.js';
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
  ModelInvocationBoundEvent,
  ModelInvocationPreparedEvent,
  ProviderMessage,
  ProviderMessageMetadata,
  RevisionFinalizedEvent,
  RevisionPublicationRecord,
  RunLifecycleEvent,
  RunTrigger,
  RunLifecycleState,
  SafeguardRecordedEvent,
  SnapshotContextRefreshedEvent,
  StorageDurabilityClass,
  ToolCallLocation,
  ToolCallProjection,
  ToolInputProviderMessage,
  ToolOutputProviderMessage,
  TurnContextSnapshot,
  TurnModelConfig,
  TurnHistoryProjectionCommittedEvent,
  UserProviderMessage,
} from '#log/event-types.js';
export { modelProviderKinds, storageDurabilityClasses } from '#log/event-types.js';
export type { PromptCacheControl } from '#log/event-types.js';
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
  ModelInvocationBinding,
  ModelStreamRequest,
  ModelTransport,
  RunLifecycleCommands,
  ToolRegistry,
} from '#waist/ports.js';
export type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';
export type { ModelCallMiddleware, ModelCallRequest } from '#harness/model-call-middleware.js';
export type { ClientContext, ClientSkill, RecentSkill, RecentSkillsPort } from '#harness/cad-middleware.js';
export type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
export type {
  AnomalyPattern,
  SafeguardDetection,
  SafeguardOutcome,
  SafeguardThresholds,
  ToolEventSummary,
} from '#harness/safeguards.js';
export type { AgentSession, AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
export type {
  CreateTauAgentHostOptions,
  ExternalAgentLogEvent,
  ExternalAgentPort,
  ExternalAgentTurn,
  ExternalRunKind,
  ExternalSessionState,
  ExternalTurnOutcome,
  TauAgentAdmissionConfig,
  TauAgentHost,
  TauAgentTurnRequest,
} from '#host/tau-agent-host.js';
export type {
  CachedSystemPromptOptions,
  GatewayModelErrorCode,
  GatewayModelTransportOptions,
} from '#transport/gateway-model-transport.js';
export type { HostToolExecutionDetails, ToolResultSubstituter } from '#harness/tools.js';
