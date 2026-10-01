/**
 * The runtime schemas of `acpSession` and `acpSessions` (MC-R30), apart from the machines so
 * each machine imports values only from `xstate` and `#` modules (MC-R2).
 */

import { z } from 'zod';
import type { AnyActorRef } from 'xstate';
import type { McpServer, SessionConfigOption, SessionUpdate, Usage as AcpUsage } from '@agentclientprotocol/sdk';

import type {
  AcpAnswer,
  AcpCallError,
  AcpCallMethod,
  AcpFailure,
  AcpLend,
  AcpSessionReport,
  AcpTurnResult,
  AcpVendorAnswer,
  AcpVendorRequest,
} from '#acp/acp-session.machine.js';
import type { AcpAcquire, AcpSlot } from '#acp/acp-sessions.machine.js';
import type { AcpAgentFacts, AcpLimitReset, AcpSessionPresentation } from '#acp/session.js';
import type { AcpAdapter } from '#acp/registry.js';

const json = <T>() => z.custom<T>();

const failureSchema = json<AcpFailure>();
const lendSchema = json<AcpLend>();

/** Events `acpSession` takes (MC-R30). */
export const childEventSchemas = {
  /* From the parent (or `openAcpSession`). */
  lend: z.object({ lend: lendSchema }),
  probeModel: z.object({ requestId: z.string(), model: z.string() }),
  cancel: z.object({}),
  close: z.object({}),
  /* From `adapterConnection`. */
  callSettled: z.object({
    id: z.string(),
    at: z.number(),
    answer: json<AcpAnswer | { readonly method: AcpCallMethod; readonly error: AcpCallError }>(),
  }),
  sessionUpdate: z.object({ sessionId: z.string(), update: json<SessionUpdate>() }),
  vendorRequest: z.object({ id: z.string(), request: json<AcpVendorRequest>() }),
  elicitationComplete: z.object({ elicitationId: z.string() }),
  adapterExited: z.object({ stderr: z.string() }),
  /* Internal (MC-R15): E17 after a cancel bound's SIGTERM. */
  killDue: z.object({}),
  /* From `lentTurn`. */
  lentReady: z.object({}),
  lentFailed: z.object({ failure: failureSchema }),
  vendorAnswered: z.object({ id: z.string(), permission: z.boolean(), answer: json<AcpVendorAnswer>() }),
  flushed: z.object({ title: json<string | undefined>(), failure: json<AcpFailure | undefined>() }),
  recorded: z.object({ failure: json<AcpFailure | undefined>() }),
};

/* `z.object({})` infers `Record<string, never>`, which would erase `type`. */
type Payload<T> = string extends keyof T ? unknown : T;
type EventOf<K extends keyof typeof childEventSchemas> = { readonly type: K } & Payload<
  z.infer<(typeof childEventSchemas)[K]>
>;
/** Events the child takes. */
export type AcpSessionEvent = { [K in keyof typeof childEventSchemas]: EventOf<K> }[keyof typeof childEventSchemas];

/** `acpSession`'s context (MC-R30). */
export const childContextSchema = z.object({
  key: z.string(),
  parentRef: json<AnyActorRef | undefined>(),
  adapter: json<AcpAdapter>(),
  cwd: z.string(),
  mcpServers: json<readonly McpServer[]>(),
  capabilityToken: z.string().optional(),
  mode: z.string().optional(),
  notices: z.boolean(),
  cwdMoved: z.boolean(),
  sessionMessageId: z.string(),
  sessionCommitted: z.boolean(),
  directories: z.array(z.string()),
  facts: json<AcpAgentFacts>(),
  /* Grok loads skills from a plugin's `skills/` directory (`_meta['x.ai/pluginDirs']`). */
  pluginDirectories: z.boolean(),
  /* The session the record names until the restore ladder answers; then the one this child prompts. */
  acpSessionId: z.string().optional(),
  contextLost: z.boolean(),
  /** Request whose prompt was dispatched; cleared for every new lend. */
  promptedRequestId: z.string().optional(),
  /* The first lend after the open still owes the opening record. */
  fresh: z.boolean(),
  configOptions: json<readonly SessionConfigOption[] | undefined>(),
  presentation: json<AcpSessionPresentation>(),
  priorUsage: json<AcpUsage | undefined>(),
  limit: json<AcpLimitReset | undefined>(),
  /* The next call id, and the one this state waits on. */
  calls: z.number().int().nonnegative(),
  pending: z.string().optional(),
  probeRequestId: z.string().optional(),
  exited: z.boolean(),
  stderr: z.string(),
  /* Why the child closed without ever opening; `closed` reports it. */
  failure: failureSchema.optional(),
  /* The turn a child is spawned with, until the open lends it. */
  opening: lendSchema.optional(),
  /* A lend that arrived while a presentation write was in flight. */
  queued: lendSchema.optional(),
  /* A newer presentation arrived while one was being written. */
  dirty: z.boolean(),
  /* The last presentation write failed: it is retried before the next lend, which it refuses if it fails again. */
  stale: z.boolean(),
});

/** Serializable state owned by {@link acpSessionMachine}. */
export type AcpSessionContext = z.infer<typeof childContextSchema>;

/* The lent turn exists only in `busy` (MC-R26). */
export const busyContextSchema = childContextSchema.extend({
  lent: lendSchema,
  outcome: json<AcpTurnResult | undefined>(),
  /* Config ids already set this turn, so a vendor that ignores one is not asked again. */
  configured: z.array(z.string()),
  /* Permission requests awaiting the person, answered `cancelled` on cancel. */
  permissions: z.array(z.string()),
  report: json<{ readonly usage?: AcpUsage | undefined; readonly model?: string | undefined } | undefined>(),
  /* The prompt's usage, the baseline once its report is durable. */
  answered: json<AcpUsage | undefined>(),
  closeAfter: z.boolean(),
  /* The cancel bound expired: `turnEnded` waits for `closed` (EA-R8). */
  deferEnd: z.boolean(),
});

export type AcpBusyContext = z.infer<typeof busyContextSchema>;

/* A `turnEnded` deferred to `closed`, after SIGKILL. */
export const closingContextSchema = childContextSchema.extend({ deferred: json<AcpSessionReport>().optional() });

/** What `acpSession` reports to its parent, or emits with none. */
export const reportSchemas = {
  opened: z.object({ key: z.string() }),
  modelProbed: z.object({
    requestId: z.string(),
    configOptions: json<readonly SessionConfigOption[] | undefined>(),
    failure: json<AcpFailure | undefined>(),
  }),
  turnEnded: z.object({
    key: z.string(),
    requestId: z.string(),
    outcome: json<AcpTurnResult>(),
    resting: z.boolean(),
  }),
  closed: z.object({ key: z.string(), failure: json<AcpFailure | undefined>() }),
};

/** Events `acpSessions` takes (MC-R30). */
export const parentEventSchemas = {
  acquire: z.object({ acquire: json<AcpAcquire>() }),
  cancel: z.object({ requestId: z.string() }),
  closeChat: z.object({ requestId: z.string(), chatId: z.string() }),
  /* Internal (MC-R15): the delayed raise `idle:<key>`. */
  idleExpired: z.object({ key: z.string() }),
  /* From a child. */
  opened: z.object({ key: z.string() }),
  turnEnded: z.object({
    key: z.string(),
    requestId: z.string(),
    outcome: json<AcpTurnResult>(),
    resting: z.boolean(),
  }),
  closed: z.object({ key: z.string(), failure: json<AcpFailure | undefined>() }),
};

/** Events `acpSessions` takes. */
export type AcpSessionsEvent = {
  [K in keyof typeof parentEventSchemas]: { readonly type: K } & z.infer<(typeof parentEventSchemas)[K]>;
}[keyof typeof parentEventSchemas];

/** `acpSessions`' context (MC-R30). */
export const parentContextSchema = z.object({
  limit: z.number().int().nonnegative(),
  idleTimeout: z.number().nonnegative(),
  renewalMargin: z.number().nonnegative(),
  /* Least recent first. */
  order: z.array(z.string()),
  slots: z.record(z.string(), json<AcpSlot>()),
  /* A pending `closeChat`, by request id, until the chat has no slots left. */
  closeRequests: z.record(z.string(), z.string()),
});

/** `acpSessions`' context. */
export type AcpSessionsContext = z.infer<typeof parentContextSchema>;

/** What `acpSessions` emits to the facade. */
export const parentEmittedSchemas = {
  turnSettled: z.object({ requestId: z.string(), outcome: json<AcpTurnResult>() }),
  chatClosed: z.object({ requestId: z.string() }),
  refused: z.object({ requestId: z.string(), failure: json<AcpFailure>() }),
};
