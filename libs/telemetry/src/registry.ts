/* eslint-disable @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation */
import { z } from 'zod';
import { defineCounter, defineHistogram, defineGauge, defineUpDownCounter } from '#define-metric.js';
import {
  agentPlacements,
  agentToolKinds,
  builtInSkillSlugs,
  evaluationClasses,
  geospecRunStatuses,
  kernelIds,
  lookupOutcomes,
  tauToolNames,
} from '#ingest.js';
import { runtimeMetrics } from '#runtime-metrics.js';

/**
 * `tau.sync.operation`: the client-facing request a sync series counts. `advertise` is a served
 * `info/refs` answer (DB1); an advertisement's refusal counts against the push or fetch it opens.
 */
const syncOperationNames = ['push', 'fetch', 'advertise', 'lfs_upload', 'lfs_download'] as const;

/** `outcome` on the sync edge. `busy` is a retryable capacity refusal; `conflict` a lost manifest race. */
const syncOutcomes = ['ok', 'ref_rejected', 'quota_refused', 'conflict', 'busy', 'unauthorized', 'error'] as const;

/** `tau.sync.refusal.code`: the typed refusals the git routes answer (W14 N1); any other code is `other`. */
const syncRefusalCodes = [
  'GIT_LEASE_OWNER_BUSY',
  'GIT_LEASE_DISK_FULL',
  'GIT_HYDRATE_BUDGET_EXHAUSTED',
  'GIT_PUSH_RACE_LOST',
  'GIT_SERVICE_RESTARTING',
  'GIT_RATE_LIMITED',
  'GIT_REPOSITORY_FROZEN',
  /* DA6: an owner over its in-flight cap (10 requests, 5 pushes), answered 429 with a jittered Retry-After. */
  'GIT_OWNER_IN_FLIGHT_LIMIT',
  'GIT_REPOSITORY_INCOMPLETE',
  'GIT_QUOTA_EXCEEDED',
  'GIT_REPOSITORY_CEILING_EXCEEDED',
  'GIT_LFS_QUOTA_EXCEEDED',
  'GIT_PUSH_NOT_COMMITTABLE',
  'GIT_SYNC_NOT_ENTITLED',
  'other',
] as const;

/** `tau.git.operation`: what a lease was admitted for. `remove_ref` is the audited ref-removal verb. */
const gitOperations = [
  'upload_pack',
  'receive_pack',
  'advertise',
  'remove_ref',
  'derive',
  'compact',
  'restore',
] as const;

/** `tau.git.execution`: where this API runs git (DC1), decided once at boot from `TAU_STORAGE_URL`. */
const gitExecutionModes = ['in_process', 'forwarded'] as const;

/** `tau.git.affinity`: how a forwarded request picks its tau-storage member (DC2); always `off` in process. */
const gitAffinityModes = ['off', 'rendezvous'] as const;

/** Repository and hydrate sizes, 64 KiB to D20's 1 GiB ceiling in doublings. */
const repositoryByteBuckets = Array.from({ length: 15 }, (_, step) => 65_536 * 2 ** step);

/** `destination` on every `tau.mirror.*` series: the second copy's store (W13 B1). */
const mirrorDestinations = ['b2'] as const;

/** `kind` of an object the copier writes or the reconciler finds missing (W13 Finding 8). */
const mirrorObjectKinds = ['pack', 'idx', 'manifest', 'segment', 'retired_marker', 'lfs', 'owner_marker'] as const;
/** `environment` on the `tau.mirror.drill_*` series: the deployment the drill read. */
const mirrorDrillEnvironments = ['staging', 'production', 'development'] as const;

/** `check` on `tau.mirror.drill_check_failures`: the verify drill's checks, then the full DR2's I2 checks (W13 Finding 8). */
const mirrorDrillChecks = [
  'snapshot',
  'missing',
  'checksum',
  'pack',
  'lfs',
  'push_log',
  'retention',
  'hidden_versions',
  'deadline',
  'error',
  'refs',
  'fsck',
  'generation_floor',
  'refuse_erased',
] as const;

/** `tau.git.route.scope`: a freeze on one repository, or the global one (DW1). */
const routeScopes = ['repository', 'global'] as const;

/** `rank` on the hot-project gauges: the top ten, never a project or owner id. */
const hotProjectRanks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

/* The storage accounting scheduler (W14 OB3, N43–N55). Every label is an enum with an `other` value or a
   fixed list: an owner, project or bucket name never reaches a label. */

/** `tau.plan`: the billing tier an owner's storage counts under (D16). */
const storagePlans = ['free', 'pro', 'enterprise'] as const;

/** `tau.storage.class`: what the stored bytes are (D18 keeps `retained` beside the plan, never charged). */
const storageClasses = ['repository', 'retained', 'lfs', 'compute', 'mirror'] as const;

/** `band` on `tau.storage.quota.owners`: an owner's use of its plan allowance. */
const quotaBands = ['lt50', '50_80', '80_95', '95_100', 'over'] as const;

/** `threshold` on `tau.git.repository.ceiling_proximity`: fractions of D20's 1 GiB repository ceiling. */
const ceilingThresholds = ['0.5', '0.8', '0.95', '1.0'] as const;

/** `tau.size_le` on the size distribution: the repository byte buckets as cumulative upper bounds. */
const repositorySizeBounds = [...Array.from({ length: 15 }, (_, step) => String(65_536 * 2 ** step)), '+Inf'] as const;

/**
 * `tau.r2.bucket`: which of Tau's buckets a figure is for, by role. The environment's two configured
 * buckets are `public` (`TAU_S3_BUCKET`) and `private` (`TAU_S3_PRIVATE_BUCKET`); every other bucket in
 * the account, another environment's included, is `other`.
 */
const r2Buckets = ['public', 'private', 'other'] as const;

/** `tau.r2.action`: R2's billed `actionType` values (R2 pricing); any other is `other`. */
const r2Actions = [
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
  'DeleteObject',
  'DeleteBucket',
  'AbortMultipartUpload',
  'other',
] as const;

/** `tau.r2.window`: the last full UTC hour, or the UTC month to date. */
const r2Windows = ['hour', 'month'] as const;

/** `tau.db.application`: the PostgreSQL `application_name` of a connection, mapped to Tau's processes. */
const databaseApplications = ['api', 'billing-operations', 'maintenance', 'mirror', 'release', 'other'] as const;

/** `tau.storage.accounting.task`: the accounting scheduler's periodic tasks. */
const accountingTasks = ['usage', 'r2_analytics', 'db', 'hot_projects', 'route'] as const;

/**
 * Canonical metric registry for Tau.
 *
 * Canonical metrics with OTEL-compliant names. Renames from legacy:
 * - `ws.connections.total` -> `ws.disconnections` (counters must not use `.total`)
 * - `kernel.execution.total` -> `kernel.executions` (counters must be pluralized, no `.total`)
 *
 * @public
 */
export const TauMetrics = {
  // --- WebSocket ---

  wsActiveConnections: defineUpDownCounter({
    name: 'ws.connections.active',
    unit: '{connection}',
    description: 'Active WebSocket connections',
    attributes: z.object({
      'ws.gateway': z.enum(['hosts', 'kernels']).optional(),
    }),
  }),

  wsDisconnections: defineCounter({
    name: 'ws.disconnections',
    unit: '{connection}',
    description:
      'Total WebSocket disconnections by close-code class. On the kernels gateway a self-hosted Zoo proxy forwards the upstream close code, so auth_failed there can mean Zoo refused the operator key.',
    attributes: z.object({
      'ws.gateway': z.enum(['hosts', 'kernels']).optional(),
      'ws.close.reason': z
        .enum([
          'normal',
          'going_away',
          'server_shutdown',
          'auth_failed',
          'policy_violation',
          'unavailable',
          'replaced',
          'error',
          'other',
        ])
        .optional(),
    }),
  }),

  wsMessageSize: defineHistogram({
    name: 'ws.message.size',
    unit: 'By',
    description: 'WebSocket frame payload sizes for capacity planning',
    buckets: [64, 256, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576, 4_194_304],
    attributes: z.object({
      'ws.gateway': z.enum(['hosts', 'kernels']).optional(),
      'ws.direction': z.enum(['inbound', 'outbound']).optional(),
    }),
  }),

  wsUpgradeRejections: defineCounter({
    name: 'ws.upgrade.rejections',
    unit: '{connection}',
    description:
      'WebSocket upgrades refused by the upgrade router or the gateway admission checks (session, device credential, route). Refusals after admission appear only under ws.disconnections.',
    attributes: z.object({
      'ws.gateway': z.enum(['hosts', 'kernels', 'none']),
      reason: z.enum(['unauthenticated', 'forbidden', 'auth_error', 'unknown_route', 'server_shutdown']),
    }),
  }),

  // --- AI / LLM (GenAI semantic conventions) ---

  genAiTokenUsage: defineHistogram({
    name: 'gen_ai.client.token.usage',
    unit: '{token}',
    description: 'LLM token consumption per request',
    buckets: [1, 4, 16, 64, 256, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576, 4_194_304, 16_777_216, 67_108_864],
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.response.model': z.string().optional(),
      'gen_ai.token.type': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'tau.surface': z.string().optional(),
      'tau.activity': z.string().optional(),
    }),
  }),

  /**
   * Custom bucket boundaries optimized for LLM call latency rather than the
   * OTEL GenAI spec's default power-of-2 boundaries. LLM calls typically range
   * from 100ms to 120s, with the critical SLO window at 1-10s. Power-of-2
   * buckets (1, 2, 4, 8, 16, 32, 64) provide insufficient resolution in the
   * sub-second range and waste buckets above 120s.
   */
  genAiOperationDuration: defineHistogram({
    name: 'gen_ai.client.operation.duration',
    unit: 's',
    description: 'End-to-end LLM call latency',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.response.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'error.type': z.string().optional(),
      'tau.surface': z.string().optional(),
    }),
  }),

  genAiTimeToFirstToken: defineHistogram({
    name: 'gen_ai.client.time_to_first_token',
    unit: 's',
    description: 'Streaming responsiveness (time to first SSE chunk)',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'tau.surface': z.string().optional(),
    }),
  }),

  genAiCost: defineCounter({
    name: 'gen_ai.client.cost',
    unit: 'USD',
    description: 'Customer-charged USD per funded LLM call (the settled credit charge, not supplier cost)',
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'tau.surface': z.string().optional(),
      'tau.activity': z.string().optional(),
    }),
  }),

  genAiToolInvocations: defineCounter({
    name: 'gen_ai.tool.invocations',
    unit: '{invocation}',
    description: 'Tool use frequency and success rate',
    attributes: z.object({
      'gen_ai.tool.name': z.string().optional(),
      'gen_ai.tool.status': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'gen_ai.file_edit.interface': z.string().optional(),
      'gen_ai.file_edit.outcome': z.string().optional(),
      'gen_ai.file_edit.recovery': z.string().optional(),
      'gen_ai.file_edit.operation_count': z.number().int().nonnegative().optional(),
      'gen_ai.file_edit.hunk_count': z.number().int().nonnegative().optional(),
    }),
  }),

  genAiToolDuration: defineHistogram({
    name: 'gen_ai.tool.duration',
    unit: 's',
    description: 'Tool execution latency by bounded outcome',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'gen_ai.tool.name': z.string().optional(),
      'gen_ai.tool.status': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
      'gen_ai.file_edit.interface': z.string().optional(),
      'gen_ai.file_edit.outcome': z.string().optional(),
      'gen_ai.file_edit.recovery': z.string().optional(),
      'gen_ai.file_edit.operation_count': z.number().int().nonnegative().optional(),
      'gen_ai.file_edit.hunk_count': z.number().int().nonnegative().optional(),
    }),
  }),

  genAiToolInputRepairs: defineCounter({
    name: 'gen_ai.tool_input.repairs',
    unit: '{repair}',
    description: 'Tool input compatibility repairs applied before strict schema validation',
    attributes: z.object({
      'gen_ai.tool.name': z.string().optional(),
      'gen_ai.tool_input.repair_kind': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  genAiAgentIterations: defineHistogram({
    name: 'gen_ai.agent.iterations',
    unit: '{iteration}',
    description: 'Agent loop iterations per user request',
    buckets: [1, 2, 3, 5, 8, 13, 21, 34, 55],
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  /**
   * Agent loop safeguards: counts how often a doom-loop / anti-pattern
   * detector ([apps/api/app/api/chat/middleware/agent-safeguards.middleware.ts])
   * decided to intervene with a `<system-reminder>` nudge or with a synthetic
   * `AIMessage` termination. Tracks whether the nudge changed the agent's
   * behavior on the next turn (`helped=true|false`) so we can tune detector
   * thresholds against real production traffic.
   */
  genAiAgentSafeguardInterventions: defineCounter({
    name: 'gen_ai.agent.safeguard.interventions',
    unit: '{intervention}',
    description: 'Agent-loop safeguard interventions (nudge or terminate) by detected anti-pattern',
    attributes: z.object({
      'gen_ai.agent.safeguard.pattern': z.string().optional(),
      'gen_ai.agent.safeguard.action': z.string().optional(),
      'gen_ai.agent.safeguard.helped': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  /**
   * Counts how often the interrupt-recovery middleware
   * ([apps/api/app/api/chat/middleware/interrupt-recovery.middleware.ts])
   * decided to inject a turn-level `<system-reminder>` after detecting a
   * contiguous tail of `USER_INTERRUPTED` ToolMessages from the previous
   * turn — and how often it suppressed a duplicate emission for the same
   * parent AIMessage signature.
   *
   * - `outcome = "emitted"` — reminder injected on this turn.
   * - `outcome = "already_fired"` — detection matched but state-level dedup
   *   suppressed the emission (the LLM has already seen the reminder for
   *   this AIMessage signature on a prior superstep).
   */
  genAiInterruptRecoveryReminders: defineCounter({
    name: 'gen_ai.agent.interrupt_recovery.reminders',
    unit: '{reminder}',
    description: 'Turn-level interrupt-recovery reminders emitted (or de-duped) by the agent middleware',
    attributes: z.object({
      'gen_ai.agent.interrupt_recovery.outcome': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  /**
   * Tool-result offloading: emitted once per tool result the
   * `tool-offloading.middleware.ts` persists to `.tau/tool-results/<chatId>/`.
   * Tracks how often each tool's output exceeds the per-tool char threshold,
   * with original vs persisted byte counts so we can quantify the prompt-cache
   * tokens saved by the offload pass.
   *
   * Counter (not histogram) so we can rate-aggregate `sum(rate(...)[5m]) by (tool_name)`
   * in Grafana without losing per-tool resolution.
   */
  chatToolResultOffloaded: defineCounter({
    name: 'chat.tool_result.offloads',
    unit: '{offload}',
    description: 'Tool results persisted to disk by the offloading middleware (by tool and size)',
    attributes: z.object({
      'tool.name': z.string().optional(),
      'tool.result.original_bytes': z.number().optional(),
      'tool.result.persisted_bytes': z.number().optional(),
      'tool.result.original_tokens_estimated': z.number().optional(),
      'tool.result.persisted_tokens_estimated': z.number().optional(),
    }),
  }),

  /**
   * Media-bearing tool results preserved through text-budget offloading so
   * provider adapters can send typed media blocks instead of base64 text.
   */
  chatToolResultMediaPreserved: defineCounter({
    name: 'chat.tool_result.media_preservations',
    unit: '{preservation}',
    description: 'Media tool results preserved instead of text-offloaded by the tool-result budget middleware',
    attributes: z.object({
      'tool.name': z.string().optional(),
      'tool.result.original_bytes': z.number().optional(),
      'tool.result.preservation_reason': z.string().optional(),
    }),
  }),

  /**
   * Per-section system-prompt byte budget. Recorded by `chat.service.ts`
   * via the `onSectionResolved` callback exposed by
   * [apps/api/app/api/chat/prompts/prompt-section-registry.ts]. One sample
   * per non-empty section per `getCadSystemPrompt` call, tagged with the
   * section name and whether the section breaks the prompt cache. Lets us
   * see which sections dominate the static prefix and which dynamic
   * sections are the largest cache invalidators.
   *
   * Buckets cover one byte through 256 KiB — most individual sections are
   * 100 B – 16 KiB; the canonical-example section is the largest in the
   * static bucket. The dynamic environment / git-status / transcript-path
   * sections are usually under 4 KiB.
   */
  genAiPromptSectionSize: defineHistogram({
    name: 'gen_ai.prompt.section.size',
    unit: 'By',
    description: 'System-prompt section byte size by section name and cache class',
    buckets: [1, 64, 256, 1024, 4096, 16_384, 65_536, 262_144],
    attributes: z.object({
      'gen_ai.prompt.section.name': z.string().optional(),
      'gen_ai.prompt.section.cache_break': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  /**
   * Context-budget estimator output by component. Recorded before provider
   * dispatch and before any content leaves the process; attributes intentionally
   * describe shape/outcome only, never prompt text.
   */
  genAiContextBudgetTokens: defineHistogram({
    name: 'gen_ai.context_budget.tokens',
    unit: '{token}',
    description: 'Estimated model-call context budget by payload component',
    buckets: [1, 4, 16, 64, 256, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576, 4_194_304],
    attributes: z.object({
      'gen_ai.context_budget.component': z.string().optional(),
      'gen_ai.context_budget.kind': z.string().optional(),
      'gen_ai.context_budget.trigger_reason': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  /**
   * Context-compaction decision counter. Emits one decision per model-call
   * budget evaluation so production can distinguish skipped, compacted,
   * failed, and overflow-retry outcomes.
   */
  genAiContextCompactionDecisions: defineCounter({
    name: 'gen_ai.context_compaction.decisions',
    unit: '{decision}',
    description: 'Context-compaction decisions by trigger reason and outcome',
    attributes: z.object({
      'gen_ai.context_budget.kind': z.string().optional(),
      'gen_ai.context_budget.trigger_reason': z.string().optional(),
      'gen_ai.context_compaction.status': z.string().optional(),
      'gen_ai.context_compaction.failure_kind': z.string().optional(),
      'gen_ai.context_compaction.failure_disposition': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  // --- Infrastructure ---

  redisConnectionState: defineGauge({
    name: 'redis.connection.state',
    unit: '',
    description: 'Redis connection health (1=connected, 0=disconnected)',
    attributes: z.object({
      'redis.role': z.string().optional(),
    }),
  }),

  /**
   * Down readiness indicators by indicator. A down indicator is the probe working (a Machine
   * fault drains the Machine; a shared dependency stays ready and is degraded), so it is counted
   * here and logged as a warning rather than reported as an application error; one increment per
   * down indicator per probe, whether or not the probe refused.
   */
  healthReadinessFailures: defineCounter({
    name: 'health.readiness.failures',
    unit: '{failure}',
    description: 'Down readiness probe indicators by health indicator',
    attributes: z.object({
      'health.indicator': z.string().optional(),
    }),
  }),

  publicationViewsTotal: defineCounter({
    name: 'publication.views',
    unit: '{view}',
    description: 'Publication view PATCH outcomes (unique increment vs duplicate ping)',
    attributes: z.object({
      deduped: z.enum(['unique', 'duplicate']).optional(),
    }),
  }),

  publicationViewsRejectedTotal: defineCounter({
    name: 'publication.views.rejections',
    unit: '{rejection}',
    description: 'Publication view PATCH rejections by reason',
    attributes: z.object({
      reason: z
        .enum(['cap_exceeded', 'owner_self_view', 'rate_limited', 'bad_cookie', 'invalid_publication'])
        .optional(),
    }),
  }),

  publicationInviteEmailsTotal: defineCounter({
    name: 'publication.invite_emails',
    unit: '{email}',
    description: 'Publication invite notification email send attempts by outcome',
    attributes: z.object({
      trigger: z.enum(['publish', 'invite']).optional(),
      outcome: z.enum(['sent', 'failed']).optional(),
    }),
  }),

  publicationInviteEmailsSuppressedTotal: defineCounter({
    name: 'publication.invite_emails.suppressions',
    unit: '{email}',
    description: 'Invite notification emails suppressed before send, by reason',
    attributes: z.object({
      trigger: z.enum(['publish', 'invite']).optional(),
      reason: z.enum(['cap_exceeded', 'limiter_unavailable']).optional(),
    }),
  }),

  publicationFileRequestsTotal: defineCounter({
    name: 'publication.file_requests',
    unit: '{request}',
    description: 'Authenticated publication file proxy requests by outcome',
    attributes: z.object({
      outcome: z.enum(['served', 'revalidated', 'denied', 'not_found', 'error']).optional(),
    }),
  }),

  // --- Client-reported (ingested via TelemetryController) ---

  // Object storage (R2 in the cloud, MinIO locally), measured at the API's one S3 client
  storageOperationDuration: defineHistogram({
    name: 'tau.storage.operation.duration',
    unit: 's',
    description: 'Object storage request time by S3 operation, bucket tier and outcome',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'tau.storage.operation': z.string().optional(),
      'tau.storage.tier': z.enum(['public', 'private', 'account']).optional(),
      outcome: z.enum(['ok', 'error']).optional(),
      'error.type': z.string().optional(),
    }),
  }),

  storageTransferBytes: defineCounter({
    name: 'tau.storage.transferred_bytes',
    unit: 'By',
    description: 'Object storage payload bytes moved by the API, by direction',
    attributes: z.object({
      'tau.storage.operation': z.string().optional(),
      'tau.storage.tier': z.enum(['public', 'private', 'account']).optional(),
      direction: z.enum(['upload', 'download']).optional(),
    }),
  }),

  kernelExecutionDuration: defineHistogram({
    name: 'kernel.execution.duration',
    unit: 's',
    description: 'CAD kernel code evaluation time (reported by client)',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    attributes: z.object({
      'kernel.status': z.string().optional(),
    }),
  }),

  kernelExecutions: defineCounter({
    name: 'kernel.executions',
    unit: '{execution}',
    description: 'Total kernel invocations (reported by client)',
    attributes: z.object({
      'kernel.status': z.string().optional(),
    }),
  }),

  kernelExportDuration: defineHistogram({
    name: 'kernel.geometry.export.duration',
    unit: 's',
    description: 'Geometry export/conversion time (reported by client)',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'kernel.status': z.string().optional(),
      'export.format': z.string().optional(),
    }),
  }),

  // --- Client-reported: extended telemetry ---

  wsReconnectionDuration: defineHistogram({
    name: 'ws.reconnection.duration',
    deprecated: {
      removal: 'the Runtime Observability follow-up after PR-4 (Tau has no versioned releases; UI releases are SHAs)',
      reason: 'D-T18: no producer in apps/ui or anywhere else; a follow-up deletes it and the panels that query it',
    },
    unit: 's',
    description: 'WebSocket reconnection latency (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'ws.reconnection.attempt': z.number().optional(),
    }),
  }),

  editorLoadDuration: defineHistogram({
    name: 'editor.load.duration',
    deprecated: {
      removal: 'the Runtime Observability follow-up after PR-4 (Tau has no versioned releases; UI releases are SHAs)',
      reason: 'D-T18: no producer in apps/ui or anywhere else; a follow-up deletes it and the panels that query it',
    },
    unit: 's',
    description: 'Editor initialization time (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'editor.kernel': z.string().optional(),
    }),
  }),

  wasmModuleLoadDuration: defineHistogram({
    name: 'wasm.module.load.duration',
    deprecated: {
      removal: 'the Runtime Observability follow-up after PR-4 (Tau has no versioned releases; UI releases are SHAs)',
      reason: 'D-T18: no producer in apps/ui or anywhere else; a follow-up deletes it and the panels that query it',
    },
    unit: 's',
    description: 'WASM module download + instantiation time (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    attributes: z.object({
      'wasm.module': z.string().optional(),
    }),
  }),

  indexeddbOperationDuration: defineHistogram({
    name: 'indexeddb.operation.duration',
    deprecated: {
      removal: 'the Runtime Observability follow-up after PR-4 (Tau has no versioned releases; UI releases are SHAs)',
      reason: 'D-T18: no producer in apps/ui or anywhere else; a follow-up deletes it and the panels that query it',
    },
    unit: 's',
    description: 'IndexedDB operation latency (reported by client)',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
    attributes: z.object({
      'indexeddb.operation': z.string().optional(),
      'indexeddb.store': z.string().optional(),
    }),
  }),

  // --- Billing / credit ledger (blueprint C11/C12; no per-user labels — cardinality) ---

  billingAttemptResolutions: defineCounter({
    name: 'tau.billing.attempt_resolutions',
    unit: '{resolution}',
    description: 'Owner attempt lookups by bounded found or voided outcome',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.attempt_resolution.outcome': z.enum(['found', 'voided']),
    }),
  }),

  billingVoidedAdmissions: defineCounter({
    name: 'tau.billing.voided_admissions',
    unit: '{admission}',
    description: 'Model admissions refused because an owner lookup already voided the key',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
    }),
  }),

  billingLedgerDrift: defineGauge({
    name: 'tau.billing.ledger_drift',
    unit: 'microusd',
    description:
      'Max absolute per-account drift between the journal sum and materialised balances (C12 — alert on non-zero)',
    attributes: z.object({}),
  }),

  billingDriftedAccounts: defineGauge({
    name: 'tau.billing.drifted_accounts',
    unit: '{account}',
    description: 'Accounts whose journal sum disagrees with materialised balances',
    attributes: z.object({}),
  }),

  billingOpenFinancialCases: defineGauge({
    name: 'tau.billing.open_financial_cases',
    unit: '{case}',
    description:
      'Open or attention financial cases by kind after each hourly reconciliation (alert on unfulfilled_purchase_obligation > 0)',
    attributes: z.object({ kind: z.string() }),
  }),

  billingFundedOperationRecoveries: defineCounter({
    name: 'tau.billing.funded_operation.recoveries',
    unit: '{operation}',
    description: 'Funded LLM recovery work by bounded outcome and capacity pool',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
      'tau.billing.recovery.outcome': z.enum(['attempted', 'claimed', 'resolved', 'failed']),
    }),
  }),

  billingSupplierCostPicoUsd: defineCounter({
    name: 'tau.billing.supplier_cost_picousd',
    unit: '{picousd}',
    description:
      "Estimated supplier cost of each live-settled funded LLM call in pico-USD, priced from its reported usage at the pinned supplier rates (Tau's cost, never customer-visible)",
    attributes: z.object({
      'gen_ai.request.model': z.string(),
      'gen_ai.provider.name': z.string(),
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
    }),
  }),

  billingSupplierUnpricedOperations: defineGauge({
    name: 'tau.billing.supplier_unpriced_operations',
    unit: '{operation}',
    description:
      'Terminal funded operations with no supplier cost estimate, by provider, sku and reason, after each hourly reconciliation',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'gen_ai.provider.name': z.string(),
      'tau.billing.sku': z.string(),
      'tau.billing.unpriced.reason': z.enum(['missing_rate', 'dimension_mismatch', 'absorbed']),
    }),
  }),

  billingProviderAccountRefusals: defineCounter({
    name: 'tau.billing.provider_account.refusals',
    unit: '{refusal}',
    description:
      "Supplier-account refusals by provider and reason: credit exhausted, or Tau's own credential rejected (401/403)",
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      providerId: z.string(),
      /* Through the funded gateway the upstream key is always Tau's, so an upstream 401/403 is a supplier-account failure. */
      reason: z.enum(['credit_exhausted', 'credential_rejected']),
    }),
  }),

  billingFundedOperationDenials: defineCounter({
    name: 'tau.billing.funded_operation.denials',
    unit: '{denial}',
    description: 'Funded LLM admission denials by bounded reason and capacity pool',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
      'tau.billing.denial.reason': z.enum([
        'genuine_saturation',
        'recovery_in_progress',
        'recovery_failed',
        'operator_route_paused',
      ]),
    }),
  }),

  billingFundedOperationTerminals: defineCounter({
    name: 'tau.billing.funded_operation.terminals',
    unit: '{operation}',
    description: 'Funded LLM terminal evidence by bounded kind, incomplete reason, and capacity pool',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
      'tau.billing.terminal.kind': z.enum([
        'final_usage',
        'provider_rejected',
        'absorbed_unknown',
        'authorized_exhausted',
      ]),
      'tau.billing.terminal.incomplete_reason': z.enum([
        'none',
        'max_output_tokens',
        'content_filter',
        'service_restart',
        'other',
      ]),
    }),
  }),

  billingFundedOperationCurrent: defineGauge({
    name: 'tau.billing.funded_operation.current',
    unit: '{operation}',
    description: 'Current pending or overdue funded LLM operations by capacity pool',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
      'tau.billing.pending.state': z.enum(['pending', 'due']),
    }),
  }),

  billingFundedOperationOldestDueAge: defineGauge({
    name: 'tau.billing.funded_operation.oldest_due_age',
    unit: 'ms',
    description: 'Age of the oldest overdue funded LLM operation by capacity pool',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
    }),
  }),

  billingFundedOperationRecoveryBatchDuration: defineHistogram({
    name: 'tau.billing.funded_operation.recovery.batch.duration',
    unit: 's',
    description: 'Duration of one bounded funded LLM recovery batch by capacity pool and outcome',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
      'tau.billing.recovery.batch.outcome': z.enum(['succeeded', 'failed']),
    }),
  }),

  billingFundedOperationRecoveryProviderExecutions: defineGauge({
    name: 'tau.billing.funded_operation.recovery.provider_executions',
    unit: '{operation}',
    description: 'Provider executions observed in DB-only funded LLM recovery; invariant is zero',
    attributes: z.object({
      'deployment.environment': z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
      'tau.billing.capacity_pool': z.enum(['primary', 'helper']),
    }),
  }),

  // --- Client-reported: agent usage for every agent (Tau, Claude Code, Codex over ACP) — W36-C ---
  // Each key maps to the Prometheus label W36's dashboards query (`agent.id` → `agent_id`); see `AttributeKey`.

  agentSessions: defineCounter({
    name: 'tau.agent.sessions',
    unit: '{session}',
    description: 'Agent sessions a client started, ended or was refused, by agent and placement (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'agent.placement': z.enum(agentPlacements),
      outcome: z.enum(['started', 'ended', 'refused']),
    }),
  }),

  agentTurns: defineCounter({
    name: 'tau.agent.turns',
    unit: '{turn}',
    description: 'Settled agent turns by agent, placement and outcome (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'agent.placement': z.enum(agentPlacements),
      outcome: z.enum(['completed', 'cancelled', 'error', 'refused']),
      /** Present only when the turn reported its context (usage metrics allowed). */
      'kernel.id': z.enum(kernelIds).optional(),
    }),
  }),

  agentTurnDuration: defineHistogram({
    name: 'tau.agent.turn.duration',
    unit: 's',
    description: 'Agent turn wall time from admission to its terminal row (reported by client)',
    buckets: [1, 2.5, 5, 10, 20, 30, 60, 120, 300, 600, 1800, 3600],
    attributes: z.object({
      'agent.id': z.string(),
      'agent.placement': z.enum(agentPlacements),
      outcome: z.enum(['completed', 'cancelled', 'error', 'refused']),
    }),
  }),

  agentTimeToFirstUpdate: defineHistogram({
    name: 'tau.agent.time_to_first_update',
    unit: 's',
    description: 'Agent turn admission to its first content update (reported by client)',
    buckets: [0.25, 0.5, 1, 2, 3, 5, 10, 20, 30, 60, 120],
    attributes: z.object({
      'agent.id': z.string(),
      'agent.placement': z.enum(agentPlacements),
    }),
  }),

  agentToolCalls: defineCounter({
    name: 'tau.agent.tool_calls',
    unit: '{call}',
    description: 'Agent tool calls by ACP tool kind and terminal status (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'tool.kind': z.enum(agentToolKinds),
      /** Tau's own tools only; absent (`""` in PromQL) for ACP rows and turns without usage metrics. */
      'tool.name': z.enum(tauToolNames).optional(),
      status: z.enum(['completed', 'failed']),
    }),
  }),

  agentTokens: defineCounter({
    name: 'tau.agent.tokens',
    unit: '{token}',
    description: 'Tokens an agent reported for its turns; absent when the agent reports no usage (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'token.type': z.enum(['input', 'output', 'cache_read', 'cache_write']),
    }),
  }),

  agentErrors: defineCounter({
    name: 'tau.agent.errors',
    unit: '{error}',
    description: 'Agent refusals and failed turns by bounded error code (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'error.code': z.string(),
    }),
  }),

  // --- Client-reported: agent context (agent usage telemetry blueprint) ---
  // Recorded only from turns that carry `detail.context`; every label is a bounded vocabulary from `ingest.ts`.

  agentCallsBeforeFirstWrite: defineHistogram({
    name: 'tau.agent.calls_before_first_write',
    unit: '{call}',
    description: 'Tool calls an agent made before its first model-file write in a turn (reported by client)',
    buckets: [0, 1, 2, 3, 5, 8, 13, 20, 30, 50, 100],
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
    }),
  }),

  agentTimeToFirstWrite: defineHistogram({
    name: 'tau.agent.time_to_first_write',
    unit: 's',
    description: 'Agent turn admission to its first model-file write (reported by client)',
    buckets: [5, 10, 20, 30, 60, 120, 300, 600, 1800],
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
    }),
  }),

  agentReferenceLookups: defineCounter({
    name: 'tau.agent.reference_lookups',
    unit: '{call}',
    description: 'Skill-reference lookups an agent made, by outcome (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
      'lookup.outcome': z.enum(lookupOutcomes),
    }),
  }),

  agentReferenceBytes: defineHistogram({
    name: 'tau.agent.reference_bytes',
    unit: 'By',
    description: "Skill-reference bytes Tau's own tools read in a turn (reported by client)",
    buckets: [1024, 4096, 16_384, 32_768, 65_536, 131_072, 262_144, 1_048_576],
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
    }),
  }),

  agentSkillActivations: defineCounter({
    name: 'tau.agent.skill_activations',
    unit: '{activation}',
    description: 'Skills an agent activated in a turn; user-authored skills count as custom (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      skill: z.enum([...builtInSkillSlugs, 'custom']),
    }),
  }),

  agentEvaluations: defineCounter({
    name: 'tau.agent.evaluations',
    unit: '{evaluation}',
    description: 'Model evaluations an agent ran, by how they ended (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
      'evaluation.class': z.enum(evaluationClasses),
    }),
  }),

  agentCorrectionsAfterError: defineHistogram({
    name: 'tau.agent.corrections_after_error',
    unit: '{write}',
    description: 'Model-file writes that followed a failed evaluation in a turn (reported by client)',
    buckets: [0, 1, 2, 3, 5, 10],
    attributes: z.object({
      'agent.id': z.string(),
      'kernel.id': z.enum(kernelIds),
    }),
  }),

  agentGeospecAssertions: defineCounter({
    name: 'tau.agent.geospec_assertions',
    unit: '{assertion}',
    description: 'GeoSpec assertions an agent ran, by result (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      result: z.enum(['passed', 'failed']),
    }),
  }),

  agentGeospecRuns: defineCounter({
    name: 'tau.agent.geospec_runs',
    unit: '{run}',
    description: 'GeoSpec test runs an agent started, by run status (reported by client)',
    attributes: z.object({
      'agent.id': z.string(),
      'run.status': z.enum(geospecRunStatuses),
    }),
  }),

  // --- Tau Sync (git smart HTTP + LFS) ---

  syncOperations: defineCounter({
    name: 'tau.sync.operations',
    unit: '{operation}',
    description:
      'Tau Sync requests by operation and outcome. A push git refused in its report-status (HTTP 200) is ref_rejected, not ok; a retryable capacity refusal (lease, hydrate budget, rate limit, restart) is busy, not error',
    attributes: z.object({
      'tau.sync.operation': z.enum(syncOperationNames),
      outcome: z.enum(syncOutcomes),
    }),
  }),

  syncOperationDuration: defineHistogram({
    name: 'tau.sync.operation.duration',
    unit: 's',
    description:
      'Whole Tau Sync request latency, lease hydrate and commit included, by where git ran and how tau-storage was chosen',
    /* 3 and 4 resolve the 3–5 s push band the Hosted Remote Storage changes are qualified on. */
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 30, 60, 120],
    attributes: z.object({
      'tau.sync.operation': z.enum(syncOperationNames),
      outcome: z.enum(syncOutcomes),
      'tau.git.execution': z.enum(gitExecutionModes),
      'tau.git.affinity': z.enum(gitAffinityModes),
    }),
  }),

  /**
   * Every typed refusal a sync request answered, by code (W14 N1). `GIT_PUSH_RACE_LOST` over
   * `tau.sync.operations{push}` is the DA5 trigger; a code outside the enum is `other`.
   */
  syncRefusals: defineCounter({
    name: 'tau.sync.refusals',
    unit: '{refusal}',
    description: 'Tau Sync requests refused with a typed code, by operation, code and HTTP status',
    attributes: z.object({
      'tau.sync.operation': z.enum(syncOperationNames),
      'tau.sync.refusal.code': z.enum(syncRefusalCodes),
      'http.response.status_code': z.number().int(),
    }),
  }),

  syncPackBytes: defineHistogram({
    name: 'tau.sync.pack.bytes',
    unit: 'By',
    description: 'Pack bytes a push received or a fetch sent',
    buckets: [1024, 16_384, 65_536, 262_144, 1_048_576, 4_194_304, 16_777_216, 67_108_864, 268_435_456, 1_073_741_824],
    attributes: z.object({
      'tau.sync.operation': z.enum(['push', 'fetch']),
    }),
  }),

  syncLeaseDuration: defineHistogram({
    name: 'tau.sync.lease.duration',
    unit: 's',
    description: 'Repository lease phase latency: hydrate from object storage, or commit packs and manifest',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    attributes: z.object({
      'tau.sync.lease.phase': z.enum(['hydrate', 'commit']),
    }),
  }),

  /** Superseded by `tau.git.commit.attempts{outcome=lost_race}` (W14 L5); delete one release after OB2. */
  syncManifestConflicts: defineCounter({
    name: 'tau.sync.manifest_conflicts',
    unit: '{conflict}',
    description: 'Manifest commits that lost the conditional (If-Match) write to another writer',
    attributes: z.object({}),
  }),

  syncSweeps: defineCounter({
    name: 'tau.sync.sweeps',
    unit: '{sweep}',
    description: 'Post-compaction repository sweeps by outcome',
    attributes: z.object({
      outcome: z.enum(['ok', 'error']),
    }),
  }),

  // --- Git execution: lease admission, hydrate and the manifest commit (Hosted Remote Storage DA2) ---
  // A name stays when its code moves from tau-api to tau-storage; `service_name` tells the two apart.

  gitAdmissions: defineCounter({
    name: 'tau.git.admissions',
    unit: '{admission}',
    description:
      'Git admission decisions by git operation and outcome; anything but admitted is a refusal (owner_capped: over the owner in-flight cap)',
    attributes: z.object({
      'tau.git.operation': z.enum(gitOperations),
      outcome: z.enum([
        'admitted',
        'owner_busy',
        'disk_full',
        'budget_exhausted',
        'restarting',
        'memory',
        'owner_capped',
      ]),
    }),
  }),

  gitLeasesActive: defineUpDownCounter({
    name: 'tau.git.leases.active',
    unit: '{lease}',
    description: 'Repository leases this Machine holds now, by git operation',
    attributes: z.object({
      'tau.git.operation': z.enum(gitOperations),
    }),
  }),

  gitLeaseReservedBytes: defineGauge({
    name: 'tau.git.lease.reserved_bytes',
    unit: 'By',
    description: 'Lease disk this Machine has reserved for admitted leases, set on every admission and release',
    attributes: z.object({}),
  }),

  gitDiskFreeBytes: defineGauge({
    name: 'tau.git.disk.free_bytes',
    unit: 'By',
    description: 'Free bytes statfs reports for the lease filesystem, read at every admission',
    attributes: z.object({}),
  }),

  gitHydrateBytes: defineHistogram({
    name: 'tau.git.hydrate.bytes',
    unit: 'By',
    description: 'Pack bytes one lease hydrate drew, by source (object store or pack cache)',
    buckets: repositoryByteBuckets,
    attributes: z.object({
      'tau.git.hydrate.source': z.enum(['object_store', 'cache']),
    }),
  }),

  gitCommitAttempts: defineCounter({
    name: 'tau.git.commit.attempts',
    unit: '{attempt}',
    description:
      'Conditional manifest writes by outcome and commit kind; a commit refused before its manifest write is not an attempt',
    attributes: z.object({
      outcome: z.enum(['committed', 'merged', 'lost_race', 'throttled', 'indeterminate', 'error']),
      'tau.git.commit.kind': z.enum(['push', 'fence', 'compaction', 'batch']),
    }),
  }),

  /**
   * One commit's latency, whole (`total`) and by phase, as `commitLease` runs them: `prepare`
   * (ref read, loose-object count, connectivity check), `compaction` (repack, compacting commits
   * only), `hash` (digests of the pack and index), `object_puts` (pack, index, retirement markers
   * and spilled push-log segment in one concurrent round), `manifest_write` (the conditional write
   * and its rate-limit retries) and `manifest_read` (the re-read of a write that did not certainly
   * win). Buckets resolve 0.25–5 s, where staging pushes commit (2026-10-28: every commit fell in
   * the old (2,5] bucket).
   */
  gitCommitDuration: defineHistogram({
    name: 'tau.git.commit.duration',
    unit: 's',
    description:
      'Commit latency by phase (prepare, compaction, hash, object puts, manifest write/read, or total) and kind',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 30],
    attributes: z.object({
      'tau.git.commit.phase': z.enum([
        'prepare',
        'compaction',
        'hash',
        'object_puts',
        'manifest_write',
        'manifest_read',
        'total',
      ]),
      'tau.git.commit.kind': z.enum(['push', 'fence', 'compaction', 'batch']),
    }),
  }),

  gitRepositorySize: defineHistogram({
    name: 'tau.git.repository.size',
    unit: 'By',
    description: 'Pack bytes of a repository after each committed write: the size distribution weighted by heat',
    buckets: repositoryByteBuckets,
    attributes: z.object({}),
  }),

  /**
   * The busiest projects as a top-N labelled only by rank (W14 N11/N12). Project ids go to the
   * `git.hot_projects` log line, never to a label.
   */
  gitHotProjectCommitRate: defineGauge({
    name: 'tau.git.hot_project.commit_rate',
    unit: '{commit}/s',
    description: 'Committed writes per second of the rank-r project by commits, over the last full minute',
    attributes: z.object({
      rank: z.enum(hotProjectRanks),
    }),
  }),

  gitHotProjectWriters: defineGauge({
    name: 'tau.git.hot_project.writers',
    unit: '{writer}',
    description: 'Distinct writers that committed to the rank-r project by writers, over the last full minute',
    attributes: z.object({
      rank: z.enum(hotProjectRanks),
    }),
  }),

  /*
   * The route table and the freeze answer (Hosted Remote Storage DW1/DW2, W14 OB5 N30–N34). Every
   * label is an enum: a repository, owner or migration id never leaves the route module.
   */
  gitRouteFrozen: defineGauge({
    name: 'tau.git.route.frozen',
    unit: '{repository}',
    description: 'Freezes holding now, by scope: repositories frozen one by one, or 1 while the global freeze holds',
    attributes: z.object({
      'tau.git.route.scope': z.enum(routeScopes),
    }),
  }),

  gitRouteFrozenOldest: defineGauge({
    name: 'tau.git.route.frozen.oldest',
    unit: 's',
    description: 'Age of the oldest freeze holding now, by scope; a migration freeze is a 20 s lease',
    attributes: z.object({
      'tau.git.route.scope': z.enum(routeScopes),
    }),
  }),

  gitRouteHolds: defineCounter({
    name: 'tau.git.route.holds',
    unit: '{request}',
    description: 'Git requests held because their repository was frozen, by how the hold ended',
    attributes: z.object({
      outcome: z.enum(['released', 'timed_out']),
    }),
  }),

  gitRouteHoldDuration: defineHistogram({
    name: 'tau.git.route.hold.duration',
    unit: 's',
    description: 'How long a held git request waited for its repository to thaw, by how the hold ended',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 6],
    attributes: z.object({
      outcome: z.enum(['released', 'timed_out']),
    }),
  }),

  gitRouteLookupDuration: defineHistogram({
    name: 'tau.git.route.lookup.duration',
    unit: 's',
    description: 'Route lookup latency on the git request path, from this Machine’s cache or from the database',
    buckets: [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
    attributes: z.object({
      'tau.git.route.source': z.enum(['cache', 'database']),
    }),
  }),

  // --- tau-api to tau-storage (Hosted Remote Storage DC1): the grant, the forward and the receipt ---

  gitGrantsRejected: defineCounter({
    name: 'tau.git.grants.rejected',
    unit: '{grant}',
    description: 'Storage grants tau-storage refused before reading a byte of the body, by reason',
    attributes: z.object({
      reason: z.enum([
        'malformed',
        'unknown_kid',
        'version',
        'signature',
        'iat_skew',
        'expired',
        'method',
        'path',
        'replay',
      ]),
    }),
  }),

  gitForwardErrors: defineCounter({
    name: 'tau.git.forward.errors',
    unit: '{request}',
    description: 'Git requests tau-api could not complete through tau-storage, by reason',
    attributes: z.object({
      reason: z.enum(['grant_rejected', 'unconfigured', 'unreachable', 'timeout', 'aborted', 'malformed_response']),
    }),
  }),

  gitReceipts: defineCounter({
    name: 'tau.git.receipts',
    unit: '{receipt}',
    description:
      'Storage receipts tau-api received, by outcome; only applied changed derived state, and ledger_unavailable left it to a repair',
    attributes: z.object({
      outcome: z.enum(['applied', 'duplicate', 'ledger_unavailable', 'manifest_mismatch', 'rejected', 'stale']),
    }),
  }),

  gitSlowBodyAborts: defineCounter({
    name: 'tau.git.slow_body.aborts',
    unit: '{request}',
    description: 'Git request bodies tau-storage aborted for moving too slowly, releasing their lease slot',
    attributes: z.object({
      'tau.git.operation': z.enum(gitOperations),
    }),
  }),

  // --- Pack cache and rendezvous affinity (Hosted Remote Storage DC2, W14 OB4) ---

  gitCacheLookups: defineCounter({
    name: 'tau.git.cache.lookups',
    unit: '{lookup}',
    description: 'Pack and index lookups a tau-storage lease made in the pack cache, by result',
    attributes: z.object({
      result: z.enum(['hit', 'miss']),
    }),
  }),

  gitCacheBytes: defineGauge({
    name: 'tau.git.cache.bytes',
    unit: 'By',
    description: 'Bytes the pack cache holds now: pinned by an open lease, or idle and evictable',
    attributes: z.object({
      state: z.enum(['pinned', 'idle']),
    }),
  }),

  gitCacheBudgetBytes: defineGauge({
    name: 'tau.git.cache.budget_bytes',
    unit: 'By',
    description: 'The pack cache budget last read: a fraction of the lease filesystem, from statfs',
    attributes: z.object({}),
  }),

  gitCacheEvictions: defineCounter({
    name: 'tau.git.cache.evictions',
    unit: '{entry}',
    description: 'Pack cache entries evicted, least recently used and never one an open lease holds',
    attributes: z.object({}),
  }),

  gitCacheEvictedBytes: defineCounter({
    name: 'tau.git.cache.evicted_bytes',
    unit: 'By',
    description: 'Bytes the pack cache evicted',
    attributes: z.object({}),
  }),

  gitCacheFallbacks: defineCounter({
    name: 'tau.git.cache.fallbacks',
    unit: '{lease}',
    description:
      'Leases hydrated straight from the object store: larger than the cache budget, or the cache failed while linking',
    attributes: z.object({
      reason: z.enum(['over_budget', 'cache_error']),
    }),
  }),

  gitSpills: defineCounter({
    name: 'tau.git.spills',
    unit: '{request}',
    description:
      'Git requests tau-api sent past the rendezvous-preferred tau-storage member, by reason (admission refused, or no answer within the start wait)',
    attributes: z.object({
      reason: z.enum(['admission', 'start_wait']),
    }),
  }),

  gitMembers: defineGauge({
    name: 'tau.git.members',
    unit: '{member}',
    description: 'Deployed tau-storage members the router ranks over, as last read',
    attributes: z.object({}),
  }),

  syncClientAttempts: defineCounter({
    name: 'tau.sync.client.attempts',
    unit: '{attempt}',
    description: 'Client-reported sync attempts by direction, outcome and agent placement',
    attributes: z.object({
      direction: z.enum(['push', 'pull']),
      outcome: z.enum(['ok', 'retry', 'quota_refused', 'offline', 'error']),
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
    }),
  }),

  syncClientLag: defineHistogram({
    name: 'tau.sync.client.lag',
    unit: 's',
    description:
      'Client-reported time from the first unsynced change (a mint, a record change, or the push request itself) to the server acknowledging it, on every acknowledged push',
    /* Dense through 3–30 s, where a save's debounce, a push and one retry land. */
    buckets: [0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900, 3600],
    attributes: z.object({
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
      /* What dated the lag: `request` is a push nothing dated, which measures only its own duration. */
      'sync.lag.since': z.enum(['change', 'queue', 'request']),
    }),
  }),

  syncClientAttemptDuration: defineHistogram({
    name: 'tau.sync.client.attempt.duration',
    unit: 's',
    description:
      'Client-reported wall time of one push or pull attempt, from its start to its settle, by direction, outcome and agent placement',
    buckets: [0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900],
    attributes: z.object({
      direction: z.enum(['push', 'pull']),
      outcome: z.enum(['ok', 'retry', 'quota_refused', 'offline', 'error']),
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
    }),
  }),

  syncClientPending: defineHistogram({
    name: 'tau.sync.client.pending',
    unit: '{revision}',
    description: 'Client-reported sync-pending queue depth when a push starts',
    buckets: [0, 1, 2, 5, 10, 25, 50, 100, 500],
    attributes: z.object({
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
    }),
  }),

  /*
   * The large-object phase of a client tree read that fetched from the remote: an open's hydrate,
   * which the pull attempt above settles before (load-path audit). `cache` is cold when nothing was
   * local yet, partial when some objects were; a read that fetched nothing is not reported.
   */
  syncClientLfsDuration: defineHistogram({
    name: 'tau.sync.client.lfs.duration',
    unit: 's',
    description:
      'Client-reported wall time of one tree read’s large-object phase (local reads, batch calls and transfers), on reads that fetched from the remote',
    buckets: [0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900],
    attributes: z.object({
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
      cache: z.enum(['cold', 'partial']),
    }),
  }),

  syncClientLfsObjects: defineCounter({
    name: 'tau.sync.client.lfs.objects',
    unit: '{object}',
    description:
      'Large objects a client tree read resolved, by whether they came from the remote or the local store, on reads that fetched from the remote',
    attributes: z.object({
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
      source: z.enum(['network', 'local']),
    }),
  }),

  syncClientLfsBytes: defineCounter({
    name: 'tau.sync.client.lfs.bytes',
    unit: 'By',
    description: 'Large-object bytes a client tree read resolved, by source, on reads that fetched from the remote',
    attributes: z.object({
      'agent.placement': z.enum(['browser', 'desktop', 'daemon']),
      source: z.enum(['network', 'local']),
    }),
  }),

  // --- B2 second copy: the `tau-mirror` copier and reconciler (W13 Finding 8, W14 OB6) ---
  // W13's Prometheus names end in their unit, so the unit word is part of the OTel name. No label
  // carries an owner or project; the busiest-lagging repositories are logged, not labelled.

  mirrorCopyLag: defineGauge({
    name: 'tau.mirror.copy_lag_seconds',
    unit: 's',
    description: 'now - min(copy_pending_since): the recovery point the second copy gives right now (W13 B5)',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorCopyLagGenerations: defineGauge({
    name: 'tau.mirror.copy_lag_generations',
    unit: '{generation}',
    description: 'max(generation - copied_generation) over every repository the copier serves',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorBacklogRepositories: defineGauge({
    name: 'tau.mirror.backlog_repositories',
    unit: '{repository}',
    description: 'Repositories behind the copy: steady (a recorded pending time) or backfill (no pending time yet)',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      phase: z.enum(['steady', 'backfill']),
    }),
  }),

  mirrorLfsBacklogObjects: defineGauge({
    name: 'tau.mirror.lfs_backlog_objects',
    unit: '{object}',
    description: 'Finalized LFS objects not yet copied',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorCopyDelay: defineHistogram({
    name: 'tau.mirror.copy_delay_seconds',
    unit: 's',
    description: 'Commit of the first uncopied generation to its snapshot written, per copy round',
    buckets: [1, 5, 10, 30, 60, 120, 300, 900, 1800, 3600, 21_600, 86_400],
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorRounds: defineCounter({
    name: 'tau.mirror.rounds',
    unit: '{round}',
    description: 'Copy rounds by outcome; an idle copier counts one noop per poll, so the series exists while it lives',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      outcome: z.enum(['copied', 'noop', 'failed', 'tombstoned']),
    }),
  }),

  mirrorObjectsCopied: defineCounter({
    name: 'tau.mirror.objects_copied',
    unit: '{object}',
    description: 'Objects written to the second copy, by kind',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      kind: z.enum(mirrorObjectKinds),
    }),
  }),

  mirrorBytesCopied: defineCounter({
    name: 'tau.mirror.bytes_copied',
    unit: 'By',
    description: 'Bytes written to the second copy, by kind',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      kind: z.enum(mirrorObjectKinds),
    }),
  }),

  mirrorCopyFailures: defineCounter({
    name: 'tau.mirror.copy_failures',
    unit: '{failure}',
    description:
      'Copy failures by stage and reason; source_missing means a manifest names an object R2 does not hold; reconcile counts a repository a reconcile pass skipped',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      stage: z.enum(['source_read', 'verify', 'dest_write', 'retention', 'watermark', 'reconcile']),
      reason: z.enum(['source_missing', 'checksum', 'http_4xx', 'http_5xx', 'timeout', 'other']),
    }),
  }),

  mirrorRetentionExtensions: defineCounter({
    name: 'tau.mirror.retention_extensions',
    unit: '{extension}',
    description: 'Object Lock extensions of the newest snapshot and its dependencies (W13 B6), by outcome',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      outcome: z.enum(['extended', 'failed']),
    }),
  }),

  mirrorRetentionMinRemaining: defineGauge({
    name: 'tau.mirror.retention_min_remaining_seconds',
    unit: 's',
    description: 'min(copy_locked_until) - now over live repositories: the lock headroom the retention sweep keeps',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorRetentionMaxAhead: defineGauge({
    name: 'tau.mirror.retention_max_ahead_seconds',
    unit: 's',
    description:
      'The furthest retain-until the reconciler saw, minus now; above 30 days something else extended a lock',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorDestinationUp: defineGauge({
    name: 'tau.mirror.destination_up',
    unit: '1',
    description: 'Whether the last probe of the second-copy destination succeeded (1) or not (0)',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorReconcileLastSuccess: defineGauge({
    name: 'tau.mirror.reconcile_last_success_timestamp_seconds',
    unit: 's',
    description: 'Unix time of the last reconcile that completed, by scope (recently active or every repository)',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      scope: z.enum(['active', 'full']),
    }),
  }),

  mirrorReconcileMissingObjects: defineGauge({
    name: 'tau.mirror.reconcile_missing_objects',
    unit: '{object}',
    description: 'Objects a copied snapshot depends on, or retired objects, that R2 holds and the copy does not',
    attributes: z.object({
      destination: z.enum(mirrorDestinations),
      kind: z.enum(mirrorObjectKinds),
    }),
  }),

  mirrorReconcileHiddenVersions: defineGauge({
    name: 'tau.mirror.reconcile_hidden_versions',
    unit: '{marker}',
    description: 'Hide (delete) markers in the copy at the last reconcile; the copier never hides, so this must be 0',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorDestinationStoredBytes: defineGauge({
    name: 'tau.mirror.destination_stored_bytes',
    unit: 'By',
    description: 'Bytes the copy holds across every version, from the last full reconcile',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  mirrorDestinationObjectVersions: defineGauge({
    name: 'tau.mirror.destination_object_versions',
    unit: '{version}',
    description: 'Object versions the copy holds, from the last full reconcile',
    attributes: z.object({ destination: z.enum(mirrorDestinations) }),
  }),

  // The verify drill (DR2-lite): `tau-mirror` reads a random sample back from the copy alone and proves
  // it against Postgres. `check` carries the full DR2's I2 names too, so its restore drill adds no series.

  mirrorDrillRuns: defineCounter({
    name: 'tau.mirror.drill_runs',
    unit: '{run}',
    description: 'Second-copy drills by outcome; a sample with nothing copied yet is not a run',
    attributes: z.object({
      environment: z.enum(mirrorDrillEnvironments),
      outcome: z.enum(['pass', 'fail']),
    }),
  }),

  mirrorDrillCheckFailures: defineCounter({
    name: 'tau.mirror.drill_check_failures',
    unit: '{failure}',
    description: 'Sampled repositories that failed a drill check, by check',
    attributes: z.object({
      environment: z.enum(mirrorDrillEnvironments),
      check: z.enum(mirrorDrillChecks),
    }),
  }),

  mirrorDrillLastSuccess: defineGauge({
    name: 'tau.mirror.drill_last_success_timestamp_seconds',
    unit: 's',
    description: 'Unix time the newest passing drill finished, seeded from mirror_drill_run at start',
    attributes: z.object({ environment: z.enum(mirrorDrillEnvironments) }),
  }),

  mirrorDrillDuration: defineHistogram({
    name: 'tau.mirror.drill_duration_seconds',
    unit: 's',
    description: 'Wall time of one verify drill over its whole sample',
    buckets: [1, 5, 10, 30, 60, 120, 300, 900, 1800, 3600],
    attributes: z.object({ environment: z.enum(mirrorDrillEnvironments) }),
  }),

  mirrorDrillVerifiedBytes: defineCounter({
    name: 'tau.mirror.drill_verified_bytes',
    unit: 'By',
    description: 'Bytes the drill read back from the copy and verified',
    attributes: z.object({ environment: z.enum(mirrorDrillEnvironments) }),
  }),

  // --- Storage accounting scheduler (Hosted Remote Storage W14 OB3) ---
  /*
   * One API Machine computes each task under a Redis lock and shares the result, so every Machine
   * exports the same figures: panels and rules read them with `max`, never `sum`.
   */

  storageUsageBytes: defineGauge({
    name: 'tau.storage.usage.bytes',
    unit: 'By',
    description: 'Stored bytes over every project, by storage class and the owner’s plan',
    attributes: z.object({
      'tau.storage.class': z.enum(storageClasses),
      'tau.plan': z.enum(storagePlans),
    }),
  }),

  storageUsageRepositories: defineGauge({
    name: 'tau.storage.usage.repositories',
    unit: '{repository}',
    description: 'Hosted repositories of live projects, by the owner’s plan',
    attributes: z.object({
      'tau.plan': z.enum(storagePlans),
    }),
  }),

  gitRepositorySizeDistribution: defineGauge({
    name: 'tau.git.repository.size_distribution',
    unit: '{repository}',
    description: 'Hosted repositories whose pack bytes are at or below each bound (cumulative), over the whole fleet',
    attributes: z.object({
      'tau.size_le': z.enum(repositorySizeBounds),
    }),
  }),

  gitRepositoryCeilingProximity: defineGauge({
    name: 'tau.git.repository.ceiling_proximity',
    unit: '{repository}',
    description: 'Hosted repositories at or above each fraction of the 1 GiB per-repository ceiling',
    attributes: z.object({
      threshold: z.enum(ceilingThresholds),
    }),
  }),

  storageQuotaOwners: defineGauge({
    name: 'tau.storage.quota.owners',
    unit: '{owner}',
    description: 'Owners with hosted storage, by plan and by how much of the plan allowance they use',
    attributes: z.object({
      'tau.plan': z.enum(storagePlans),
      band: z.enum(quotaBands),
    }),
  }),

  databaseConnections: defineGauge({
    name: 'tau.db.connections',
    unit: '{connection}',
    description: 'PostgreSQL client connections to this database, by application and state',
    attributes: z.object({
      'tau.db.application': z.enum(databaseApplications),
      state: z.enum(['active', 'idle', 'idle_in_transaction', 'other']),
    }),
  }),

  databaseConnectionBudget: defineGauge({
    name: 'tau.db.connection_budget',
    unit: '{connection}',
    description: 'Client connections the database admits: max_connections less the superuser reserve',
    attributes: z.object({}),
  }),

  r2Requests: defineGauge({
    name: 'tau.r2.requests',
    unit: '{request}',
    description: 'R2 operations Cloudflare counted, by bucket, class, action, status and window',
    attributes: z.object({
      'tau.r2.bucket': z.enum(r2Buckets),
      'tau.r2.class': z.enum(['A', 'B', 'free']),
      'tau.r2.action': z.enum(r2Actions),
      'tau.r2.status': z.enum(['success', 'userError', 'internalError', 'other']),
      'tau.r2.window': z.enum(r2Windows),
    }),
  }),

  r2StoredBytes: defineGauge({
    name: 'tau.r2.stored_bytes',
    unit: 'By',
    description: 'Payload and metadata bytes stored per R2 bucket, from Cloudflare’s latest storage sample',
    attributes: z.object({
      'tau.r2.bucket': z.enum(r2Buckets),
    }),
  }),

  r2Objects: defineGauge({
    name: 'tau.r2.objects',
    unit: '{object}',
    description: 'Objects stored per R2 bucket, from Cloudflare’s latest storage sample',
    attributes: z.object({
      'tau.r2.bucket': z.enum(r2Buckets),
    }),
  }),

  r2BandwidthBytes: defineGauge({
    name: 'tau.r2.bandwidth_bytes',
    unit: 'By',
    description: 'R2 bytes moved per bucket, by direction and window; Cloudflare omits transfers under 100 KiB',
    attributes: z.object({
      'tau.r2.bucket': z.enum(r2Buckets),
      direction: z.enum(['upload', 'download']),
      'tau.r2.window': z.enum(r2Windows),
    }),
  }),

  storageAccountingPasses: defineCounter({
    name: 'tau.storage.accounting.passes',
    unit: '{pass}',
    description: 'Storage accounting passes by task and outcome; `skipped` is a task its configuration leaves off',
    attributes: z.object({
      'tau.storage.accounting.task': z.enum(accountingTasks),
      outcome: z.enum(['ok', 'error', 'skipped']),
    }),
  }),

  storageAccountingLastSuccess: defineGauge({
    name: 'tau.storage.accounting.last_success',
    unit: 's',
    description: 'Unix time the figures a storage accounting task exports were computed',
    attributes: z.object({
      'tau.storage.accounting.task': z.enum(accountingTasks),
    }),
  }),

  // --- Billing workers (F-10) ---

  billingWorkerPasses: defineCounter({
    name: 'tau.billing.worker.passes',
    unit: '{pass}',
    description:
      'Completed billing-worker passes; a gauge keeps exporting its last value, so this is the liveness signal',
    attributes: z.object({
      'tau.worker': z.enum(['recovery', 'operations']),
      outcome: z.enum(['ok', 'error']),
    }),
  }),

  // --- Runtime observation (Runtime Observability PR-2; recorded by the API at ingest) ---

  ...runtimeMetrics,
} as const;
