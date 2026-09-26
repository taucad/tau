/**
 * What a turn's admission carries over either leg: the model row, the prompt blocks, the tool grant, the client's
 * context and, for an external turn, the agent selector (`config.agent`, drift item 2). Zod only.
 */

import { z } from 'zod';

import { jsonValueSchema, modelReasoningConfigSchema, userProviderMessageSchema } from '#log/event-schema.js';

const nonEmptyString = z.string().min(1);

/**
 * The catalog providers Tau's gateway speaks: Anthropic's own route plus the OpenAI-compatible one. A closed set, so
 * the wire never imports the transport to check it (F11).
 *
 * @public
 */
export const gatewayProviderKinds = [
  'anthropic',
  'openai',
  'vertexai',
  'cerebras',
  'together',
  'morph',
  'xai',
  'moonshot',
] as const;

/** One cache-aware system-prompt block accepted at admission. @public */
export const agentChannelSystemPromptBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  cacheControl: z
    .strictObject({
      type: z.literal('ephemeral'),
      scope: z.literal('global').optional(),
    })
    .optional(),
});

/** Catalog pricing in dollars per million tokens. @public */
export const agentChannelModelCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});

/** One catalog model row a client may name for its turn, and the row "Resume" selects (SC-G4). @public */
export const agentChannelModelSchema = z.strictObject({
  id: nonEmptyString,
  providerKind: z.enum(gatewayProviderKinds),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive().optional(),
  cost: agentChannelModelCostSchema.optional(),
  reasoning: modelReasoningConfigSchema.optional(),
});

/** How the turn may use tools: a mode, or an explicit allowlist. @public */
export const agentChannelToolChoiceSchema = z.union([z.enum(['none', 'auto', 'any', 'custom']), z.array(z.string())]);

/* Loose, deliberately: the browser assembles richer skill rows than the host consumes (`resourceUri`, `source`,
 * `version`, …) and a strict relist here would reject real client payloads at admission. */
const clientContextSchema = z.strictObject({
  skills: z
    .array(
      z.looseObject({
        name: nonEmptyString,
        description: z.string(),
        fingerprint: z.string().optional(),
      }),
    )
    .optional(),
  memory: z.record(z.string(), z.string()).optional(),
});

/**
 * Which agent runs the turn. Absent, the host's own harness runs it against a Tau model; present, a daemon starts an
 * external agent through its pinned ACP adapter, which brings its own model, tools and the user's own CLI login (X6).
 *
 * @public
 */
export const agentChannelRunKindSchema = z.strictObject({
  kind: z.literal('acp'),
  id: nonEmptyString,
  /** Adapter-specific model id; absent takes whatever the adapter defaults to. */
  model: nonEmptyString.max(128).optional(),
  /** Exact ACP session configuration ids and values. */
  config: z.record(nonEmptyString, z.union([z.string(), z.boolean()])).optional(),
});

/** Per-admission model, prompt, tool and client context, identical on both legs (drift items 2, 3). @public */
export const agentChannelAdmissionConfigSchema = z.strictObject({
  agent: agentChannelRunKindSchema.optional(),
  systemPrompt: z.string(),
  systemPromptBlocks: z
    .union([
      z.tuple([agentChannelSystemPromptBlockSchema, agentChannelSystemPromptBlockSchema]),
      z.tuple([
        agentChannelSystemPromptBlockSchema,
        agentChannelSystemPromptBlockSchema,
        agentChannelSystemPromptBlockSchema,
      ]),
    ])
    .optional(),
  /** Optional on both legs; the owner fills its default (drift item 3). */
  model: agentChannelModelSchema.optional(),
  toolChoice: agentChannelToolChoiceSchema,
  allowedTools: z.array(z.string()).optional(),
  snapshot: jsonValueSchema.optional(),
  contextPayload: clientContextSchema.optional(),
  contextMessages: z.array(userProviderMessageSchema).optional(),
});

/** Client-supplied admission overrides. @public */
export type AgentChannelAdmissionConfig = z.infer<typeof agentChannelAdmissionConfigSchema>;

/** One catalog model row, as the wire carries it. @public */
export type AgentChannelModel = z.infer<typeof agentChannelModelSchema>;
