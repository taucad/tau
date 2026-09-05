// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';
import { kernelProviders } from '@taucad/types/constants';
import { chatModes } from '#constants/chat-mode.constants.js';
import { toolModes, toolNames } from '#constants/tool.constants.js';
import { contextPayloadSchema } from '#schemas/context-payload.schema.js';
import { snapshotSchema } from '#schemas/metadata.schema.js';

/**
 * Per-request tool-choice for an agent profile.
 * Mirrors the metadata-side encoding (single mode literal *or* explicit tool whitelist).
 * @public
 */
export const toolChoiceSchema = z.union([z.enum(toolModes), z.array(z.enum(toolNames))]);

/**
 * Which host runs a Tau turn.
 *
 * Absent means the page's own dedicated worker — the browser host, and the
 * wire-compatible default every pre-W4 execution parses as. Two literals are
 * reserved: `origin` is the daemon that *served this page* (rung 1, discovered
 * same-origin at `/.well-known/tau-host`), and `desktop` is the Electron
 * services utility's in-process launcher. Anything else is a paired device id
 * from `GET /v1/agents` (rung 2).
 *
 * @public
 */
export type TauAgentHostId = 'origin' | 'desktop' | (string & {});

/** Tau-owned LangGraph/model execution for one CAD turn. @public */
export const tauAgentExecutionSchema = z
  .object({
    kind: z.literal('tau'),
    model: z.string().min(1),
    /** See {@link TauAgentHostId}; absent = this browser's own worker. */
    hostId: z.string().min(1).optional(),
  })
  .strict()
  .meta({ id: 'TauAgentExecution' });

/**
 * An external ACP agent (Claude Code, Codex) running on a Tau Host.
 *
 * `hostId` is **required**, unlike Tau's own execution: there is no browser
 * placement for an external agent — the adapter is a local process spawned by a
 * daemon, so a turn that names no host has nowhere to run.
 *
 * The agent always works in a materialized branch, never the workspace root:
 * SP-4 proved ACP session modes are advisory against a CLI whose own config
 * disables approvals, so confinement is the host's filesystem placement and the
 * revision mode is not a user choice for this execution.
 *
 * @public
 */
export const acpAgentExecutionSchema = z
  .object({
    kind: z.literal('acp'),
    /** See {@link TauAgentHostId}; `origin`, `desktop`, or a paired device id. */
    hostId: z.string().min(1),
    /** Registry agent id the daemon advertised, e.g. `claude` or `codex`. */
    agentId: z.string().min(1).max(64),
  })
  .strict()
  .meta({ id: 'AcpAgentExecution' });

/** Paseo-owned coding-agent execution selected through a paired connection. @public */
export const paseoAgentExecutionSchema = z
  .object({
    kind: z.literal('paseo'),
    connectionId: z.string().min(1).max(128),
    agentId: z.string().min(1).max(256),
  })
  .strict()
  .meta({ id: 'PaseoAgentExecution' });

/** Execution substrate for a CAD turn. This is deliberately separate from Tau's model-provider catalog. @public */
export const cadAgentExecutionSchema = z
  .discriminatedUnion('kind', [tauAgentExecutionSchema, acpAgentExecutionSchema, paseoAgentExecutionSchema])
  .meta({ id: 'CadAgentExecution' });

/**
 * Per-request configuration for the CAD agent profile.
 *
 * This is the single source of truth for "what does the CAD agent need to know
 * about this turn" — execution substrate, kernel target, mode, tool whitelist, the
 * testing-tools flag, and the editor snapshot / client-assembled context payload.
 *
 * `snapshot` and `contextPayload` are truly optional: callers that omit them
 * get `undefined` server-side, and downstream consumers branch on presence with
 * a single `if (snapshot)` check. Encoding them as `.default({})` would force
 * the controller to recognise the "empty default" sentinel and collapse it back
 * to `undefined` — an ugly indirection that buys nothing the schema doesn't
 * already express.
 *
 * @public
 */
export const cadAgentConfigSchema = z
  .object({
    profile: z.literal('cad'),
    execution: cadAgentExecutionSchema,
    kernel: z.enum(kernelProviders),
    mode: z.enum(chatModes),
    toolChoice: toolChoiceSchema,
    testingEnabled: z.boolean(),
    snapshot: snapshotSchema.optional(),
    contextPayload: contextPayloadSchema.optional(),
  })
  .strict()
  .meta({ id: 'CadAgentConfig' });

/**
 * Per-request configuration for the project-name generator profile.
 * The handler is fully parameter-free — it takes a single user message and
 * emits a generated project name. No knobs at the caller level.
 * @public
 */
export const projectNameAgentConfigSchema = z
  .object({
    profile: z.literal('project_name'),
  })
  .meta({ id: 'ProjectNameAgentConfig' });

/**
 * Per-request configuration for the commit-name generator profile.
 * Same shape as `project_name` — fully parameter-free.
 * @public
 */
export const commitNameAgentConfigSchema = z
  .object({
    profile: z.literal('commit_name'),
  })
  .meta({ id: 'CommitNameAgentConfig' });

/**
 * Discriminated union of every supported agent profile.
 * The `profile` field disambiguates which variant the handler should run.
 *
 * Adding a new profile is a strict three-step contract change:
 * 1. Add a new `xxxAgentConfigSchema` here.
 * 2. Add it as a branch of this union.
 * 3. Add a handler case in the API controller's `switch(body.agent.profile)`.
 *
 * @public
 */
export const agentConfigSchema = z
  .discriminatedUnion('profile', [cadAgentConfigSchema, projectNameAgentConfigSchema, commitNameAgentConfigSchema])
  .meta({ id: 'AgentConfig' });

/** Parsed (server-side) shape of the CAD agent config. @public */
export type CadAgentConfig = z.infer<typeof cadAgentConfigSchema>;

/**
 * Wire (input) shape of the CAD agent config. Identical to the parsed shape
 * because no field carries a `.default(...)` — `snapshot` / `contextPayload`
 * are optional both on the wire and after parsing.
 * @public
 */
export type CadAgentConfigInput = z.input<typeof cadAgentConfigSchema>;

/** Parsed execution-substrate selection for a CAD turn. @public */
export type CadAgentExecution = z.infer<typeof cadAgentExecutionSchema>;

/** Tau-owned execution selection. @public */
export type TauAgentExecution = z.infer<typeof tauAgentExecutionSchema>;

/** External ACP agent execution selection. @public */
export type AcpAgentExecution = z.infer<typeof acpAgentExecutionSchema>;

/** Paseo-owned execution selection. @public */
export type PaseoAgentExecution = z.infer<typeof paseoAgentExecutionSchema>;

/** Parsed shape of the project-name agent config. @public */
export type ProjectNameAgentConfig = z.infer<typeof projectNameAgentConfigSchema>;

/** Wire shape of the project-name agent config. @public */
export type ProjectNameAgentConfigInput = z.input<typeof projectNameAgentConfigSchema>;

/** Parsed shape of the commit-name agent config. @public */
export type CommitNameAgentConfig = z.infer<typeof commitNameAgentConfigSchema>;

/** Wire shape of the commit-name agent config. @public */
export type CommitNameAgentConfigInput = z.input<typeof commitNameAgentConfigSchema>;

/** Parsed (server-side) shape of the discriminated agent config union. @public */
export type AgentConfig = z.infer<typeof agentConfigSchema>;

/** Wire (input) shape of the discriminated agent config union. @public */
export type AgentConfigInput = z.input<typeof agentConfigSchema>;
