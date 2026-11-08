/**
 * Bounded label vocabularies for the funded LLM gateway's latency and prompt-cache series (chat latency
 * and prompt cache program, W3.1). Every list ends in `other` or an explicit unknown, so a new value
 * never mints a series.
 */

/**
 * `gen_ai.provider.name` on the gateway latency and cache series: the API's gateway provider ids
 * (`apps/api/app/api/providers/provider-gateway.ts`). An API test pins this copy to that source.
 * @public
 */
export const llmGatewayProviders = [
  'anthropic',
  'cerebras',
  'moonshot',
  'morph',
  'openai',
  'together',
  'vertexai',
  'xai',
  'other',
] as const;

/** `tau.llm.wire`: the gateway route family a request arrived on, known before the body is parsed. @public */
export const llmGatewayWires = ['anthropic', 'openai-completions', 'openai-responses', 'other'] as const;

/** `http.request.encoding`: the request body's content coding. Gzip is deferred, so this is `identity` today. @public */
export const llmRequestEncodings = ['identity', 'gzip', 'other'] as const;

/**
 * `outcome` on the admission duration: how the gateway left admission. `held` is an admitted
 * operation that was not dispatched (it lost the dispatch race or had no dispatch time left).
 * @public
 */
export const llmAdmissionOutcomes = ['dispatched', 'held', 'replayed', 'refused', 'cancelled', 'error'] as const;

/**
 * `tau.turn.step`: whether a model step is the first of a user turn, as the agent host asserts it in
 * `x-tau-turn-step`. `unknown` when the caller sent no or a malformed header.
 * @public
 */
export const turnSteps = ['first', 'continuation', 'unknown'] as const;

/**
 * `tau.turn.gap`: the pause from the chat's previous model step (its last prompt-cache touch) to this
 * turn, as the agent host asserts it in `x-tau-turn-gap`. The 5 and 60 minute edges are the provider
 * cache lifetime classes.
 * @public
 */
export const turnGaps = ['first_turn', 'lt_5m', '5m_60m', 'gt_60m', 'unknown'] as const;

/**
 * `tau.prompt_cache.outcome` of one settled step: `hit` when cache reads are at least half of its
 * input, `partial` when below, `miss` when none, `unreported` when the provider reported no cache
 * dimension.
 * @public
 */
export const promptCacheOutcomes = ['hit', 'partial', 'miss', 'unreported'] as const;

/** `gen_ai.token.type` on the turn-step cache token counter. `cache_write_1h` is the 1-hour write tier. @public */
export const turnStepTokenTypes = ['input', 'cache_read', 'cache_write', 'cache_write_1h', 'output'] as const;
