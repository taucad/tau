/* eslint-disable @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation */
import { z } from 'zod';
import { defineCounter, defineHistogram, defineGauge, defineUpDownCounter } from '#define-metric.js';

/**
 * Canonical metric registry for Tau.
 *
 * All 21 metrics with OTEL-compliant names. Renames from legacy:
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
    attributes: z.object({}),
  }),

  wsDisconnections: defineCounter({
    name: 'ws.disconnections',
    unit: '{connection}',
    description: 'Total WebSocket disconnections by reason',
    attributes: z.object({
      'ws.close.reason': z.string().optional(),
    }),
  }),

  wsMessageSize: defineHistogram({
    name: 'ws.message.size',
    unit: 'By',
    description: 'WebSocket RPC payload sizes for capacity planning',
    buckets: [64, 256, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576, 4_194_304],
    attributes: z.object({
      'ws.direction': z.string().optional(),
      'rpc.method': z.string().optional(),
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
    }),
  }),

  genAiCost: defineCounter({
    name: 'gen_ai.client.cost',
    unit: 'USD',
    description: 'Estimated cost per LLM call',
    attributes: z.object({
      'gen_ai.operation.name': z.string().optional(),
      'gen_ai.request.model': z.string().optional(),
      'gen_ai.provider.name': z.string().optional(),
    }),
  }),

  genAiToolInvocations: defineCounter({
    name: 'gen_ai.tool.invocations',
    unit: '{invocation}',
    description: 'Tool use frequency and success rate',
    attributes: z.object({
      'gen_ai.tool.name': z.string().optional(),
      'gen_ai.tool.status': z.string().optional(),
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

  // --- Client-reported (ingested via TelemetryController) ---

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
} as const;
