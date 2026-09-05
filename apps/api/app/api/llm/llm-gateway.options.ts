export type LlmGatewayOptions = {
  readonly requestsPerMinute: number;
  readonly maxConcurrentRequests: number;
  readonly maxProviderConcurrentRequests: number;
  readonly upstreamIdleTimeoutMs: number;
  readonly postAbortSettlementTimeoutMs: number;
  readonly concurrencyLeaseMs: number;
  readonly concurrencyHeartbeatMs: number;
  readonly maxSseEventBytes: number;
};

export const llmGatewayOptionsKey = Symbol('llmGatewayOptions');

const positiveInteger = (name: string, fallback: number, maximum: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${String(maximum)}.`);
  }
  return value;
};

export const loadLlmGatewayOptions = (): LlmGatewayOptions => {
  const upstreamIdleTimeoutMs = positiveInteger('TAU_LLM_GATEWAY_UPSTREAM_IDLE_TIMEOUT_MS', 30_000, 300_000);
  const postAbortSettlementTimeoutMs = positiveInteger('TAU_LLM_GATEWAY_ABORT_SETTLEMENT_TIMEOUT_MS', 120_000, 300_000);
  const concurrencyLeaseMs = Math.max(300_000, upstreamIdleTimeoutMs + postAbortSettlementTimeoutMs);
  return {
    requestsPerMinute: positiveInteger('TAU_LLM_GATEWAY_RATE_LIMIT_PER_MINUTE', 60, 10_000),
    maxConcurrentRequests: positiveInteger('TAU_LLM_GATEWAY_MAX_CONCURRENCY', 4, 100),
    maxProviderConcurrentRequests: positiveInteger('TAU_LLM_GATEWAY_MAX_PROVIDER_CONCURRENCY', 100, 10_000),
    upstreamIdleTimeoutMs,
    postAbortSettlementTimeoutMs,
    concurrencyLeaseMs,
    concurrencyHeartbeatMs: Math.max(1000, Math.floor(concurrencyLeaseMs / 4)),
    maxSseEventBytes: 256 * 1024,
  };
};
