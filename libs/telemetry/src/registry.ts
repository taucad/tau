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

/**
 * Canonical metric registry for Tau.
 *
 * Canonical metrics with OTEL-compliant names. Renames from legacy:
 * - `ws.connections.total` -> `ws.disconnections` (counters must not use `.total`)
 * - `sse.events.total` -> `sse.events` (counters must not use `.total`)
 * - `kernel.execution.total` -> `kernel.executions` (counters must be pluralized, no `.total`)
 *
 * @public
 */
export const TauMetrics = {
  // --- WebSocket / RPC ---

  rpcCallDuration: defineHistogram({
    name: 'rpc.server.call.duration',
    unit: 's',
    description: 'RPC round-trip latency',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    attributes: z.object({
      'rpc.method': z.string().optional(),
      'rpc.status': z.string().optional(),
    }),
  }),

  rpcActiveCalls: defineUpDownCounter({
    name: 'rpc.server.active_calls',
    unit: '{call}',
    description: 'Currently in-flight RPC calls',
    attributes: z.object({
      'rpc.method': z.string().optional(),
    }),
  }),

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

  rpcDeliveryEvents: defineCounter({
    name: 'rpc.delivery.events',
    unit: '{event}',
    description: 'Durable chat RPC delivery transitions by plane and outcome',
    attributes: z.object({
      'rpc.delivery.stage': z.string(),
      'rpc.delivery.outcome': z.string().optional(),
      'rpc.delivery.transport': z.string().optional(),
    }),
  }),

  rpcDeliveryWakeDuration: defineHistogram({
    name: 'rpc.delivery.wake.duration',
    unit: 's',
    description: 'Time spent waiting for a durable RPC response wake-up',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    attributes: z.object({
      'rpc.delivery.transport': z.string(),
    }),
  }),

  rpcActiveRunRooms: defineUpDownCounter({
    name: 'rpc.delivery.rooms.active',
    unit: '{room}',
    description: 'Run rooms currently retained by authenticated RPC sockets',
    attributes: z.object({}),
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

  sseActiveConnections: defineUpDownCounter({
    name: 'sse.connections.active',
    unit: '{connection}',
    description: 'Active SSE streams',
    attributes: z.object({}),
  }),

  sseEvents: defineCounter({
    name: 'sse.events',
    unit: '{event}',
    description: 'SSE events emitted',
    attributes: z.object({
      'sse.event.type': z.string().optional(),
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
    unit: 's',
    description: 'WebSocket reconnection latency (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'ws.reconnection.attempt': z.number().optional(),
    }),
  }),

  editorLoadDuration: defineHistogram({
    name: 'editor.load.duration',
    unit: 's',
    description: 'Editor initialization time (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    attributes: z.object({
      'editor.kernel': z.string().optional(),
    }),
  }),

  wasmModuleLoadDuration: defineHistogram({
    name: 'wasm.module.load.duration',
    unit: 's',
    description: 'WASM module download + instantiation time (reported by client)',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    attributes: z.object({
      'wasm.module': z.string().optional(),
    }),
  }),

  indexeddbOperationDuration: defineHistogram({
    name: 'indexeddb.operation.duration',
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
        'supplier_route_paused',
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
      'Tau Sync requests by operation and outcome. A push git refused in its report-status (HTTP 200) is ref_rejected, not ok',
    attributes: z.object({
      'tau.sync.operation': z.enum(['push', 'fetch', 'lfs_upload', 'lfs_download']),
      outcome: z.enum(['ok', 'ref_rejected', 'quota_refused', 'conflict', 'unauthorized', 'error']),
    }),
  }),

  syncOperationDuration: defineHistogram({
    name: 'tau.sync.operation.duration',
    unit: 's',
    description: 'Whole Tau Sync request latency, lease hydrate and commit included',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
    attributes: z.object({
      'tau.sync.operation': z.enum(['push', 'fetch', 'lfs_upload', 'lfs_download']),
      outcome: z.enum(['ok', 'ref_rejected', 'quota_refused', 'conflict', 'unauthorized', 'error']),
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
    description: 'Client-reported time from the first unsynced mint to the server acknowledging it',
    buckets: [0.5, 1, 2, 3, 5, 10, 30, 60, 300, 900, 3600],
    attributes: z.object({
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
} as const;
