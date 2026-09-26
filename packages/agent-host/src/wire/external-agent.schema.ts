/**
 * External-agent vocabulary every tier carries (VSC1, VSC4): the descriptor a daemon advertises, the login facts a
 * surface renders, and the stop an external turn records. Zod only.
 */

import { z } from 'zod';

import type { RefusalCode } from '#wire/refusals.js';

const nonEmptyString = z.string().min(1);

/**
 * Every typed refusal an external-agent run may carry to a surface (VSC4).
 *
 * A refusal is a *fact about the agent*, not a stack trace: each code names one
 * thing the user can act on — log in, pick another model, install the adapter —
 * so a surface renders an affordance rather than a vendor sentence with a
 * stderr tail attached. The code travels on `run.lifecycle.detail.code` and on
 * a thrown channel error alike; the facts a login needs travel beside it as an
 * {@link externalAgentLoginSchema} interrupt.
 *
 * @public
 */
export const externalAgentRefusalCodes = [
  'EXTERNAL_AGENT_AUTH_REQUIRED',
  'EXTERNAL_AGENT_MODEL_UNAVAILABLE',
  'EXTERNAL_AGENT_UNAVAILABLE',
  'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
  'CLI_TOO_OLD',
  'CLI_NOT_FOUND',
  'ADAPTER_NOT_INSTALLED',
  'ADAPTER_NO_BIN',
] as const satisfies readonly RefusalCode[];

/** One {@link externalAgentRefusalCodes} value. @public */
export type ExternalAgentRefusalCode = (typeof externalAgentRefusalCodes)[number];

/**
 * One external agent, exactly as every tier carries it (VSC1).
 *
 * This is the **sole** shape of `externalAgents`: the daemon's `ready` frame,
 * `GET /.well-known/tau-host`, the API relay, the desktop preload bootstrap and
 * the browser's placement ladder all speak it, and the string list it replaced
 * is gone (EQ18, VI9). It lives beside the refusal codes because it is wire
 * vocabulary both the host and the browser import from one place.
 *
 * Every field is bounded because all of it is **daemon-authored text rendered
 * in a browser**: `displayName` and a model `name` come from a vendor adapter's
 * own config options, so they are untrusted at render time exactly as an
 * agent's message text is.
 *
 * A `refusal` is an agent this installation *knows about* and cannot start.
 * It is carried rather than dropped so a GUI can say why a row is missing
 * instead of silently offering less than the user installed (V9).
 *
 * @public
 */
export const externalAgentDescriptorSchema = z.strictObject({
  /** Stable registry id, the value `acpAgentExecutionSchema.agentId` carries. */
  id: z.string().min(1).max(64),
  /** Product name for the selector row. */
  displayName: z.string().min(1).max(64),
  /**
   * Models the discovery probe read off the agent's `category: 'model'` select,
   * in the order the agent listed them. Empty when the probe failed or timed
   * out — never a reason to drop the agent (EQ1 fallback B).
   */
  models: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
      }),
    )
    .max(64),
  /** The select's `currentValue`: what a turn naming no model actually runs. */
  defaultModel: z.string().min(1).max(128).optional(),
  /** Present exactly when this agent cannot be started; `models` is then empty. */
  refusal: z.enum(externalAgentRefusalCodes).optional(),
});

/** One agent as every tier carries it (VSC1). @public */
export type ExternalAgentDescriptor = z.infer<typeof externalAgentDescriptorSchema>;

/** One login method an agent offered, flattened for presentation. @public */
export const externalAgentAuthMethodSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string().optional(),
  /**
   * A command line the *user* runs in their own terminal, ready to copy.
   *
   * X6: Tau never runs it and never sees what it produces — the vendor's
   * credential stays in the vendor's own store on the user's own machine.
   */
  terminalCommand: nonEmptyString.optional(),
});

/**
 * What a surface needs to get the user logged in to an external agent.
 *
 * One shape for both portable flows, because both end at the same banner: a
 * `-32000` refusal carries the `authMethods` the agent offered, and a URL
 * elicitation carries the verification `url` and `code` the agent is waiting
 * on. It is the payload of an `interrupt.recorded` of kind
 * `external-agent-login` and the payload of the `EXTERNAL_AGENT_AUTH_REQUIRED`
 * refusal, so a renderer written once serves both (V11).
 *
 * @public
 */
export const externalAgentLoginSchema = z.strictObject({
  kind: z.literal('external-agent-login'),
  /** Agent the user has to log in to. */
  agentId: nonEmptyString,
  /** Methods the agent listed at `initialize`; empty for a bare URL elicitation. */
  authMethods: z.array(externalAgentAuthMethodSchema),
  /** Where the user completes a URL (device-code) login. */
  url: z.string().optional(),
  /** The verification code that URL asks for, when the agent sent one. */
  code: z.string().optional(),
  /** The elicitation this login answers; absent for an initialize-time refusal. */
  elicitationId: nonEmptyString.optional(),
});

/** The login facts a surface renders; see {@link externalAgentLoginSchema}. @public */
export type ExternalAgentLogin = z.infer<typeof externalAgentLoginSchema>;

/**
 * Codes an external-agent turn that *started* and then stopped short records.
 *
 * Unlike {@link externalAgentRefusalCodes}, these are not facts about whether
 * the agent can run: the turn ran and its provider stopped it.
 * `EXTERNAL_AGENT_LIMIT_REACHED` is the person's own account at a usage, rate
 * or session limit — an ordinary state, not a crash. `EXTERNAL_AGENT_FAILED` is
 * everything else. Both carry an {@link externalAgentStopSchema} as
 * `run.lifecycle.detail.details`.
 *
 * @public
 */
export const externalAgentStopCodes = [
  'EXTERNAL_AGENT_LIMIT_REACHED',
  'EXTERNAL_AGENT_FAILED',
] as const satisfies readonly RefusalCode[];

/** One {@link externalAgentStopCodes} value. @public */
export type ExternalAgentStopCode = (typeof externalAgentStopCodes)[number];

/**
 * Why an external-agent turn stopped, as the agent itself classified it.
 *
 * `failure` mirrors the ACP AIR `sessionFailure` object both pinned adapters
 * send: `title` is the provider's own sentence, verbatim (its link and reset
 * time included), and `actions` is the agent's word on what can help, so an
 * empty list means retrying cannot. `resetsAt` and `window` are present only
 * when the agent reported its limit's reset as data (Claude Code does, on
 * `usage_update`; the failure object itself never carries one).
 * `diagnostics` is the adapter's log tail, present only for a failure the agent
 * could not classify; a surface shows it on request, never as the message.
 *
 * @public
 */
export const externalAgentStopSchema = z.looseObject({
  agentId: nonEmptyString,
  failure: z.looseObject({
    /** `limit`, `service`, `connection`, `access`, `request` or a later category. */
    category: z.string(),
    title: z.string(),
    /** `retry`, `new_session`, `login` or a later action. */
    actions: z.array(z.string()),
  }),
  /** When the exhausted limit refreshes, in epoch seconds. */
  resetsAt: z.number().int().positive().optional(),
  /** The agent's own name for the exhausted window, e.g. `five_hour` or `seven_day`. */
  window: z.string().optional(),
  diagnostics: z.string().optional(),
});

/** The stop facts a surface renders; see {@link externalAgentStopSchema}. @public */
export type ExternalAgentStop = z.infer<typeof externalAgentStopSchema>;
