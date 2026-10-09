import { z } from 'zod';

/**
 * Canonical entry name constants used in `performance.measure()` and ingest payloads.
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention -- OTEL constant enum uses UPPER_SNAKE_CASE */
export const IngestEntryName = {
  KERNEL_CREATE_GEOMETRY: 'observability.createGeometry',
  KERNEL_EXPORT_GEOMETRY: 'observability.exportGeometry',
  WEBSOCKET_RECONNECTION: 'observability.websocketReconnection',
  EDITOR_LOAD: 'observability.editorLoad',
  WASM_MODULE_LOAD: 'observability.wasmModuleLoad',
  INDEXEDDB_OPERATION: 'observability.indexeddbOperation',
  AGENT_SESSION: 'agent.session',
  AGENT_TURN: 'agent.turn',
  SYNC_ATTEMPT: 'observability.syncAttempt',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- end OTEL constants block */

const kernelCreateGeometryEntrySchema = z.object({
  name: z.literal(IngestEntryName.KERNEL_CREATE_GEOMETRY),
  duration: z.number().nonnegative(),
  /* Strict: the client keeps its error message locally and sends only `status`; free text is refused. */
  detail: z
    .strictObject({
      status: z.string().optional(),
    })
    .optional(),
});

const kernelExportGeometryEntrySchema = z.object({
  name: z.literal(IngestEntryName.KERNEL_EXPORT_GEOMETRY),
  duration: z.number().nonnegative(),
  detail: z
    .strictObject({
      status: z.string().optional(),
      exportFormat: z.string().optional(),
    })
    .optional(),
});

const websocketReconnectionEntrySchema = z.object({
  name: z.literal(IngestEntryName.WEBSOCKET_RECONNECTION),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      attempt: z.number().int().nonnegative().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

const editorLoadEntrySchema = z.object({
  name: z.literal(IngestEntryName.EDITOR_LOAD),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      kernel: z.string().optional(),
      fileCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const wasmModuleLoadEntrySchema = z.object({
  name: z.literal(IngestEntryName.WASM_MODULE_LOAD),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      module: z.string().optional(),
      sizeBytes: z.number().nonnegative().optional(),
    })
    .optional(),
});

const indexeddbOperationEntrySchema = z.object({
  name: z.literal(IngestEntryName.INDEXEDDB_OPERATION),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      operation: z.string().optional(),
      store: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

/* Agent usage (W36-C). Every string is a bounded label: ids and codes are shape-checked, the rest are enums. */

/** A descriptor's agent id: `tau`, `claude`, `codex`, … @public */
export const agentIdSchema = z.string().regex(/^[a-z][\d_a-z-]{0,31}$/);

/**
 * The agent ids recorded as themselves: Tau's own and the ACP registry's pinned adapters
 * (`packages/host/src/acp/registry.ts`). Any other id is recorded as `other`, so a custom agent never mints a series.
 * @public
 */
export const knownAgentIds: ReadonlySet<string> = new Set(['tau', 'claude', 'codex', 'grok']);

/** Where an agent turn ran. @public */
export const agentPlacements = ['browser', 'desktop', 'daemon', 'cloud'] as const;

/** ACP's `ToolKind` taxonomy; Tau's own tools are mapped onto it (`tauToolKinds`). @public */
export const agentToolKinds = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
] as const;

/**
 * Tau's own tool names, the keys of `tauToolKinds` in `@taucad/agent-host`. Copied rather than imported so this
 * dependency-light library never depends on the agent host; `vocabulary-contract.test.ts` pins the copy to the source.
 * @public
 */
export const tauToolNames = [
  'read_file',
  'list_directory',
  'grep',
  'glob_search',
  'web_search',
  'web_browser',
  'create_file',
  'edit_file',
  'arrange_workbench',
  'delete_file',
  'evaluate_model',
  'get_parameters',
  'apply_parameter_operation',
  'test_model',
  'export_model',
  'screenshot',
  'revisions',
  'use_skill',
  'update_todos',
  'ask_questions',
  'get_machine',
  'request_print',
  'get_print_request',
  'get_print_profiles',
  'list_print_requests',
  'cancel_print',
] as const;

/**
 * Kernel ids, the `id`s of `kernelConfigurations` in `@taucad/types`. Copied and pinned like {@link tauToolNames}.
 * @public
 */
export const kernelIds = [
  'picogk',
  'picovoxel',
  'build123d',
  'openscad',
  'replicad',
  'manifold',
  'zoo',
  'jscad',
  'opencascadejs',
  'tscircuit',
] as const;

/**
 * Built-in skill slugs: the `agent/skills.json` bundles under `packages/` that `@taucad/skills` ships as
 * `systemSkillBundles`. Copied and pinned like {@link tauToolNames}; a user-authored skill reports as `custom`.
 * @public
 */
export const builtInSkillSlugs = [
  'cad-build123d',
  'cad-jscad',
  'cad-manifold',
  'cad-opencascadejs',
  'cad-openscad',
  'cad-picogk',
  'cad-picovoxel',
  'cad-replicad',
  'cad-tscircuit',
  'cad-zoo',
  'geospec-authoring',
  'workbench',
] as const;

/** Why a skill-reference lookup ended as it did. @public */
export const lookupOutcomes = ['ok', 'zero_match', 'not_found', 'tool_error'] as const;

/** How a model evaluation ended, classified on the device from issue type, code and message patterns. @public */
export const evaluationClasses = ['ok', 'api_misuse', 'compile', 'runtime', 'timeout', 'kernel', 'other'] as const;

/** A GeoSpec `test_model` run status. @public */
export const geospecRunStatuses = ['passed', 'failed', 'inconclusive', 'unsupported', 'not-run'] as const;

/** A refusal or failure code, e.g. `CLI_NOT_FOUND`, `MODEL_STREAM_STALLED`. @public */
export const agentErrorCodeSchema = z.string().regex(/^[A-Z][\dA-Z_]{0,63}$/);

/**
 * A non-negative number clamped to `max`: an outlier degrades to the ceiling instead of dropping the whole entry.
 *
 * @param max - The ceiling.
 * @returns The clamping schema.
 */
const clamped = (max: number) =>
  z
    .number()
    .nonnegative()
    .transform((value) => Math.min(value, max));

/**
 * A non-negative integer clamped to `max`, like {@link clamped}.
 *
 * @param max - The ceiling.
 * @returns The clamping schema.
 */
const clampedInt = (max: number) =>
  z
    .number()
    .int()
    .nonnegative()
    .transform((value) => Math.min(value, max));

/** Milliseconds; a day bounds any one turn. */
const agentDurationSchema = clamped(86_400_000);

/** Token counts are per turn; one turn never legitimately reports more than this. */
const tokenCountSchema = clamped(100_000_000);

const agentSessionEntrySchema = z.object({
  name: z.literal(IngestEntryName.AGENT_SESSION),
  duration: agentDurationSchema,
  detail: z.object({
    agentId: agentIdSchema,
    placement: z.enum(agentPlacements),
    /** The refusal's code rides the refused turn entry, so `tau.agent.errors` counts it once. */
    outcome: z.enum(['started', 'ended', 'refused']),
  }),
});

/**
 * What a turn did with its context: counts and bounded vocabularies only, never paths, patterns, names or messages.
 * Present only when the person allows usage metrics.
 */
const agentTurnContextSchema = z.object({
  kernelId: z.enum(kernelIds),
  skillsActivated: z.array(z.enum([...builtInSkillSlugs, 'custom'])).max(8),
  /** Tool calls before the first model-file write; absent when the turn wrote no model file. */
  callsBeforeFirstModelWrite: clampedInt(1000).optional(),
  /** Admission to the first model-file write. Milliseconds. */
  timeToFirstModelWrite: agentDurationSchema.optional(),
  referenceLookups: z
    .array(z.object({ outcome: z.enum(lookupOutcomes), count: clampedInt(1000) }))
    .max(lookupOutcomes.length),
  /** UTF-8 bytes of skill-reference output read by Tau's own tools; absent for ACP agents. */
  referenceBytesRead: clampedInt(10_000_000).optional(),
  evaluations: z
    .array(z.object({ class: z.enum(evaluationClasses), count: clampedInt(100) }))
    .max(evaluationClasses.length),
  /** Model-file writes that followed a non-`ok` evaluation. */
  correctionsAfterError: clampedInt(100),
  geospec: z
    .object({
      runs: clampedInt(100),
      /** Passed assertions across the turn's runs. */
      passed: clampedInt(10_000),
      /** Failed assertions across the turn's runs. */
      failed: clampedInt(10_000),
      runStatuses: z
        .array(z.object({ status: z.enum(geospecRunStatuses), count: clampedInt(100) }))
        .max(geospecRunStatuses.length),
    })
    .optional(),
});

/** One settled turn: `duration` is admission to terminal, in milliseconds. */
const agentTurnEntrySchema = z.object({
  name: z.literal(IngestEntryName.AGENT_TURN),
  duration: agentDurationSchema,
  detail: z.object({
    agentId: agentIdSchema,
    placement: z.enum(agentPlacements),
    outcome: z.enum(['completed', 'cancelled', 'error', 'refused']),
    errorCode: agentErrorCodeSchema.optional(),
    /** Admission to the first content update, in milliseconds. */
    timeToFirstUpdate: agentDurationSchema.optional(),
    toolCalls: z
      .array(
        z.object({
          kind: z.enum(agentToolKinds),
          /** Tau's own tools only; ACP rows and turns without usage-metrics consent omit it. */
          tool: z.enum(tauToolNames).optional(),
          status: z.enum(['completed', 'failed']),
          count: z
            .number()
            .int()
            .positive()
            .transform((value) => Math.min(value, 10_000)),
        }),
      )
      .max((agentToolKinds.length + tauToolNames.length) * 2)
      .optional(),
    /** Present only when the agent reported usage; never estimated. */
    tokens: z
      .object({
        input: tokenCountSchema,
        output: tokenCountSchema,
        cacheRead: tokenCountSchema,
        cacheWrite: tokenCountSchema,
      })
      .optional(),
    context: agentTurnContextSchema.optional(),
  }),
});

/** One Tau Sync push or pull a client's `sync.machine` settled; `duration` is the attempt's own time. */
const syncAttemptEntrySchema = z.object({
  name: z.literal(IngestEntryName.SYNC_ATTEMPT),
  duration: z.number().nonnegative(),
  detail: z.object({
    direction: z.enum(['push', 'pull']),
    outcome: z.enum(['ok', 'retry', 'quota_refused', 'offline', 'error']),
    placement: z.enum(['browser', 'desktop', 'daemon']),
    /** First unsynced mint to the server's ack, on an acknowledged push only. */
    lagMilliseconds: z.number().nonnegative().optional(),
    /** `.git/sync-pending` depth when the push started. */
    pending: z.number().int().nonnegative().optional(),
  }),
});

/**
 * Discriminated union of all client metric entry shapes.
 * Used for validating individual entries in the ingest payload.
 * @public
 */
export const clientMetricEntrySchema = z.discriminatedUnion('name', [
  kernelCreateGeometryEntrySchema,
  kernelExportGeometryEntrySchema,
  websocketReconnectionEntrySchema,
  editorLoadEntrySchema,
  wasmModuleLoadEntrySchema,
  indexeddbOperationEntrySchema,
  agentSessionEntrySchema,
  agentTurnEntrySchema,
  syncAttemptEntrySchema,
]);

/**
 * Schema for the full ingest payload sent from client workers to the API.
 * @public
 */
export const ingestPayloadSchema = z.object({
  entries: z.array(clientMetricEntrySchema).min(1),
});

/** Inferred type of a single client metric entry. @public */
export type ClientMetricEntry = z.infer<typeof clientMetricEntrySchema>;

/** Inferred type of an `agent.turn` entry's optional `detail.context`. @public */
export type AgentTurnContext = z.infer<typeof agentTurnContextSchema>;

/** Inferred type of the full ingest payload. @public */
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
