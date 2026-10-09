export { projectionFactSchema, projectionSourceHealthSchema, projectionBatchSchema } from '#log/projection-facts.js';
export type {
  ProjectionFact,
  KnownProjectionFact,
  KnownProjectionEvent,
  ProjectionEffect,
  ProjectionSourceHealth,
  ProjectionBatch,
} from '#log/projection-facts.js';
export { foldProjectionFacts } from '#log/chat-ledger.js';
export type { FoldProjectionFactsInput } from '#log/chat-ledger.js';
export { EventLogError } from '#log/event-log-error.js';
export { parseEventLog, serializeLogEvent } from '#log/serialization.js';
export { reduceEventLog } from '#log/reducer.js';
export { mergeLogSegments } from '#log/segments.js';
export type { ChatLogSegment, MergeLogSegmentsOptions } from '#log/segments.js';
export {
  agentLogEventSchema,
  jsonValueSchema,
  parseLogEvent,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
export { createAgentSession, createTransportStreamFunction, requestedMaxTokens } from '#harness/session.js';
export { createTauAgentHost } from '#host/tau-agent-host.js';
export { isResumableRun, isResumableRunFailure, isUserStoppedRun } from '#log/resumable.js';
export {
  emptyChatLedger,
  foldChatLedger,
  foldReadAnswer,
  replayedStartOutcome,
  unsettledAttempts,
} from '#log/chat-ledger.js';
export type {
  ChatLedger,
  InvocationEntry,
  LedgerAnomaly,
  LedgerPosition,
  ReadFold,
  ReplayedStartOutcome,
  RunEntry,
} from '#log/chat-ledger.js';
export { followChat, readFolded } from '#log/follow-chat.js';
export type { ChatRead, FoldedRead } from '#log/follow-chat.js';
/* The seam's owner half, shared by the daemon launcher and the browser worker. The wire vocabulary itself ships
 * from `@taucad/agent-host/wire`. */
export { createCommandOwner } from '#channel/command-owner.js';
export type { CommandEffect, CommandOwnerOptions } from '#channel/command-owner.js';
/* The transport union. Types only — the client half itself ships from `@taucad/agent-host/channel-client`. */
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
export type { AgentChannelClient } from '#channel/agent-channel-client.js';
/* R3: apps never import `@taucad/rpc`, so the few channel types an app needs to
 * declare its own worker protocol are re-exported from here. */
export type { Channel, ChannelServer, ChannelServerHandle, WireProtocolSchemas, WithTransferables } from '@taucad/rpc';
export {
  GatewayModelTransportError,
  createCachedSystemPromptBlocks,
  createGatewayModelTransport,
  isGatewayProviderKind,
  isOpenAiGatewayProviderKind,
} from '#transport/gateway-model-transport.js';
export { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
export { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
export { normalizeLatexDelimiters, trimToolResultContext } from '#harness/cad-middleware.js';
export { HostCompactionError } from '#harness/compaction.js';
export { defaultSafeguardThresholds, summarizeToolEvents } from '#harness/safeguards.js';
export { canonicalJson } from '#log/canonical-json.js';
export { normalizeToolInput, tauToolKinds, toPiToolContent } from '#harness/tools.js';
export type { EventLogErrorCode } from '#log/event-log-error.js';
export type { EventLogAppender, EventLogAppendOutcome, EventLogBatch } from '#log/event-log-appender.js';
export type {
  AgentLogEvent,
  AgentToolChoice,
  AssistantProviderMessage,
  CompactionTrace,
  HistoryCompactedEvent,
  HistoryRewoundEvent,
  InterruptRecordedEvent,
  JsonObject,
  JsonValue,
  LogEventBase,
  RowKey,
  ModelSystemPromptBlock,
  ModelProviderKind,
  MessageAppendedEvent,
  MessageEnvelopeReplacedEvent,
  ModelInvocationBoundEvent,
  ModelInvocationPreparedEvent,
  ModelInvocationSettledEvent,
  ModelReasoningConfig,
  ProviderMessage,
  ProviderMessageMetadata,
  TurnConflictedLogEvent,
  TurnFailedLogEvent,
  TurnChangedLogEvent,
  TurnFinalizedLogEvent,
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
  TurnPlacement,
  UserProviderMessage,
} from '#log/event-types.js';
export { modelProviderKinds, storageDurabilityClasses } from '#log/event-types.js';
export type { PromptCacheControl } from '#log/event-types.js';
export type {
  DurableEventLog,
  AgentLiveEvent,
  SourceLiveEvent,
  HostRun,
  HostRunFailure,
  HostRunSnapshot,
  HostToolApproval,
  HostToolApprovalAnswer,
  HostToolApprovalRecord,
  HostToolDefinition,
  HostToolInvocation,
  HostToolResult,
  InterruptRequest,
  InterruptResolution,
  MaterializedDocument,
  ModelStreamEvent,
  ModelInvocationBinding,
  ModelStreamRequest,
  ModelTransport,
  InvocationFunding,
  InvocationResolutionRequest,
  TurnAttemptKey,
  TurnPlacementAnswer,
  TurnPlacementFact,
  TurnPlacementGrant,
  TurnPlacementPort,
  TurnSettlementRow,
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
export type {
  AgentRunOutcome,
  AgentSession,
  AgentSessionModel,
  CreateAgentSessionOptions,
  HostClock,
  StreamStallBound,
} from '#harness/session.js';
export { materializeAttachments } from '#harness/session-record.js';
export type { AttachmentReader, DocumentBlockBuilder, MaterializedAttachments } from '#harness/session-record.js';
export type {
  ExternalAgentLogEvent,
  ExternalAgentPort,
  ExternalAgentTurn,
  ExternalRunKind,
  ExternalSessionState,
  ExternalTurnOutcome,
  TauAgentAdmissionConfig,
} from '#host/external-agent.js';
export type { CommandKey, CreateTauAgentHostOptions, TauAgentHost, TauAgentTurnRequest } from '#host/tau-agent-host.js';
export type {
  CachedSystemPromptOptions,
  GatewayModelErrorCode,
  GatewayModelTransportOptions,
} from '#transport/gateway-model-transport.js';
export type { HostToolExecutionDetails, ToolResultSubstituter } from '#harness/tools.js';
