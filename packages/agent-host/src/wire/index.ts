/* oxlint-disable no-barrel-files/no-barrel-files -- the published `./wire` subpath barrel */

/**
 * `@taucad/agent-host/wire`: the one seam contract (D11). Strict payload-only schemas, the answers, the reads, the
 * hello and limits, and the refusal registry. Imports only `zod` and zod-only schemas, so the page, the CLI,
 * apps/api and the run actor share it.
 */

export {
  agentChannelAdmissionConfigSchema,
  agentChannelModelCostSchema,
  agentChannelModelSchema,
  agentChannelRunKindSchema,
  agentChannelSystemPromptBlockSchema,
  agentChannelToolChoiceSchema,
  gatewayProviderKinds,
} from '#wire/admission.schema.js';
export type { AgentChannelAdmissionConfig, AgentChannelModel } from '#wire/admission.schema.js';
export { agentWireLimits } from '#wire/limits.js';
export { chatIdSchema, commandAnswerSchema, commandPayloads } from '#wire/commands.schema.js';
export type {
  CommandAnswer,
  CommandFrame,
  CommandInput,
  CommandPayload,
  CommandVerb,
  HostCommand,
} from '#wire/commands.schema.js';
export {
  externalAgentAuthMethodSchema,
  externalAgentDescriptorSchema,
  externalAgentLoginSchema,
  externalAgentRefusalCodes,
  externalAgentStopCodes,
  externalAgentStopSchema,
} from '#wire/external-agent.schema.js';
export type {
  ExternalAgentDescriptor,
  ExternalAgentLogin,
  ExternalAgentRefusalCode,
  ExternalAgentStop,
  ExternalAgentStopCode,
} from '#wire/external-agent.schema.js';
export {
  agentChannelRevisionEventSchema,
  agentLiveEventSchema,
  sourceLiveEventSchema,
  agentWireHelloSchema,
  agentWireProtocolSchemas,
  agentWireVersion,
  catchUpRequestSchema,
  catchUpPositionSchema,
  catchUpFrameSchema,
  readAnswerSchema,
  readRequestSchema,
  rowKeySchema,
} from '#wire/frames.schema.js';
export type {
  AgentChannelRevisionEvent,
  AgentWireHello,
  AgentWireProtocol,
  CatchUpRequest,
  CatchUpInput,
  CatchUpFrame,
  ReadAnswer,
  ReadInput,
  ReadRequest,
} from '#wire/frames.schema.js';
export { attemptReceiptSchema, gatewayErrorCodes } from '#wire/gateway.js';
export type { GatewayErrorCode, InvocationResolution } from '#wire/gateway.js';
export { isResumable, refusalOf, refusals } from '#wire/refusals.js';
export { turnPlacementSchema, turnSettlementSchema } from '#wire/settlement.schema.js';
export type { TurnPlacementRecord, TurnSettlementBody } from '#wire/settlement.schema.js';
export type { RefusalCode, RefusalEntry, RefusalOwner, RetryClass } from '#wire/refusals.js';
