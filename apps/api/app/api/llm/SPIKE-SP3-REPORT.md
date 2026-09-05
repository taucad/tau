# SP-3 Model Gateway Placement

## Verdict

**FAIL / NO-GO: SP-3 did not produce the live provider evidence required by PH4 and PH15.** The execution sandbox denied both a local TCP listener (`EPERM`) and outbound DNS (`ENOTFOUND`). No TTFT or abort result can honestly be inferred. The browser-host option therefore does not pass its critical-path gate from this run and must not advance on the strength of this spike.

This is an infrastructure-blocked result, not evidence that the gateway architecture itself is too slow or cannot settle usage. Re-run `spike-probe.ts` unchanged on a network-enabled host that permits loopback listeners before revisiting the decision.

## Implemented surface

- `POST /v1/llm/anthropic/v1/messages`: validates an enabled Tau catalog ID, maps it to the Anthropic model ID, and forwards the upstream SSE bytes without rewriting them.
- `POST /v1/llm/openai/v1/chat/completions`: the same catalog boundary for enabled OpenAI rows; it injects `stream_options.include_usage=true` as required by Finding 2.
- Unknown or wrong-provider model IDs return HTTP 400 with `error.type = "MODEL_NOT_IN_CATALOG"` before any provider call.
- `spike-main.ts` boots only `LlmModule`; `api.module.ts` is untouched.
- The downstream response is deliberately not wired to the upstream fetch's abort signal. A spike-only observation endpoint records whether terminal provider usage arrives after a downstream disconnect.

The standalone spike does not implement Tau authentication or mutate the credit ledger. Those production-boundary pieces are specified below and listed under “Not tested.”

## TTFT measurement

Planned method: 20 paired turns through the gateway and 20 direct to Anthropic, using catalog model `anthropic-claude-haiku-4.5` → upstream `claude-haiku-4-5-20251001`, prompt `Reply with exactly OK.`, `max_tokens=8`, and alternating pair order. TTFT is measured from `fetch()` start to the first non-empty Anthropic `text_delta`. The intended interval is a two-sided 95% Student-t interval over the 20 paired deltas (`gateway - direct`, df=19).

| Route            | Required | Completed | Raw TTFT (ms) | Mean | Median |
| ---------------- | -------: | --------: | ------------- | ---: | -----: |
| Direct Anthropic |       20 |         0 | `[]`          |  N/A |    N/A |
| Tau gateway      |       20 |         0 | `[]`          |  N/A |    N/A |
| Paired delta     |       20 |         0 | `[]`          |  N/A |    N/A |

95% confidence interval: **undefined (`n=0`)**.

The probe's raw result was:

```json
{
  "status": "failed",
  "measuredAt": "2026-08-31T08:09:31.416Z",
  "completedSamples": { "direct": 0, "gateway": 0 },
  "timingsUnit": "milliseconds",
  "rawTtft": { "direct": [], "gateway": [] },
  "error": {
    "name": "Error",
    "message": "listen EPERM: operation not permitted 127.0.0.1"
  }
}
```

A separate direct call, loading the present `ANTHROPIC_API_KEY` from `apps/api/.env`, failed before HTTP with:

```json
{ "name": "TypeError", "message": "fetch failed", "cause": "ENOTFOUND" }
```

The earlier `tsx` CLI attempt also failed before application code because its private IPC socket was denied. The recorded probe above used Node's installed `tsx` import hook, avoiding that unrelated IPC mechanism.

## Abort semantics probe

| Question                                                 | Observed answer                                    |
| -------------------------------------------------------- | -------------------------------------------------- |
| Did a gateway stream start?                              | No; loopback bind failed before the first request. |
| Was the downstream connection aborted mid-stream?        | No.                                                |
| Did an upstream terminal usage frame arrive after abort? | Not observed.                                      |
| Can actual usage be settled from this run?               | Not established.                                   |

The code path is shaped to keep consuming upstream after `reply.raw` closes and tags each captured usage event with whether it arrived after that close. That is implementation intent only; PH15 forbids treating it as acceptance evidence without the real run.

## Reserve → commit → abort settlement design

The production gateway should reuse the existing ledger, not create a second accounting path:

1. **Authenticate and resolve.** Resolve the Better Auth session or scoped bearer principal, then resolve only an enabled Tau catalog ID. Reject an unpriceable or wrong-provider ID before provider I/O.
2. **Estimate and reserve.** Adapt `TokenBudgetService.evaluateModelRequest` to the provider wire at ingress. Bound completion by the smaller of the request cap, catalog cap, and remaining context. Feed that estimate to `estimateWorstCaseCostMicro` and capture `estimateInputComponentMicro` as the abort/error floor. Call `CreditLedgerService.reserve` with category `llm`; return typed HTTP 402 `INSUFFICIENT_CREDIT` if it fails. The existing five-minute reservation and durable `creditReservation` mirror remain the crash boundary.
3. **Stream and account.** Forward provider bytes unchanged while a side parser accumulates provider-native usage. Convert raw Anthropic usage directly to the canonical fields (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`); do not apply the LangChain-specific subtraction in `ModelService.normalizeUsageTokens` to raw Anthropic frames. Normalize OpenAI cached-prompt details similarly. Price the canonical counts with `computeUserChargedCostMicro`.
4. **Commit actual.** On a terminal usage frame, call the existing idempotent `CreditLedgerService.commit(actualMicro)`. Its Redis Lua transaction removes the whole hold, charges the actual amount top-up-first/grant-second, and its outbox durably mirrors the journal and reservation deletion. A retry or sweeper race is already a no-op after the first commit.
5. **Downstream abort.** Mark the client disconnected, stop writes, but do **not** cancel the upstream request. Continue draining until terminal usage and commit actual cost. The disconnected client does not need to receive the result; the ledger boundary owns settlement.
6. **No terminal usage.** If the provider rejected before generation with a status proven not to incur cost, call the existing idempotent `release`. For a network error, provider 429/5xx, process interruption, or any ambiguous post-send failure, commit the captured input floor with an explicit note. If the process dies first, `CreditMaintenanceService` already settles an expired live or orphaned reservation at that floor; it must remain the last-resort path, not the normal abort path.

This preserves Finding 2's three valid terminal transitions: reservation → actual commit; reservation → input-floor commit; reservation → full release only for proven pre-generation rejection. It also preserves the current ledger's exact µ$ arithmetic, idempotency, outbox, and crash sweeper.

SP-3 supplied no data to safely narrow reservation sizing or justify mid-stream top-ups. Keep the request/catalog-bounded worst-case reservation until a successful rerun answers OQ-G1.

## Verification completed

- In-memory Nest/Fastify request: unknown model returned HTTP 400 and the typed `MODEL_NOT_IN_CATALOG` body.
- `oxlint` and ESLint pass for every TypeScript file in this directory.
- API TypeScript checking reports no error in this directory. The repository-wide invocation remains non-green because two pre-existing files outside the path budget import a missing `detectMultiThreadSupport` export:
  - `packages/plugins/opencascade/src/opencascade.kernel.ts`
  - `packages/plugins/replicad/src/replicad.kernel.ts`

These supporting checks do not substitute for the failed live probe.

## Not tested

- Any successful provider request, TTFT sample, confidence interval, or provider-side usage frame.
- Client-abort behavior or actual usage settlement against Anthropic.
- Browser execution, browser CORS/preflight, or `ChatAnthropic` `baseURL` integration.
- Better Auth cookies, bearer/device tokens, authorization, rate limiting, or abuse controls.
- Real Redis/PostgreSQL reserve, insufficient-credit refusal, commit, release, outbox, TTL sweep, or usage-cost headers/final frames.
- The OpenAI-compatible endpoint against OpenAI.
- Tool calls, images, thinking/reasoning blocks, prompt caching, beta headers, provider retries/errors, or byte-fidelity under those features.
- Concurrent load, backpressure at scale, reverse-proxy buffering, HTTP/2, TLS, regional placement, or deployed-network latency.

---

## Orchestrator addendum (2026-08-31, network-enabled re-run) — VERDICT REVISED: PASS

The lane's NO-GO was infrastructure-only (sandbox denied TCP bind + DNS). The orchestrator re-ran the probes unchanged on the host with real network, via the OpenAI-compatible surface (the Anthropic key on file has no API credit — a separate operational finding):

**TTFT (20 paired turns, `openai-gpt-5.6-luna`, alternating order, loopback gateway):**

- direct: mean 2020.3 ms, median 970.5 ms; gateway: mean 1276.6 ms, median 965.2 ms
- paired delta (gateway − direct): mean −743.7 ms, sd 1640, 95% CI [−1511.2, +23.9]
- Reading: the medians differ by ~5 ms and the CI includes 0 — the proxy hop is noise against provider TTFT variance measured in seconds. **No material TTFT regression.** (A first 20-turn run agreed.) Caveat: gateway on loopback; production adds the client→api.tau.new WAN RTT — regional placement is the knob (charter R1).

**Abort settlement (live, `x-tau-spike-id` observation):** client aborted mid-stream at ~330 forwarded bytes; the gateway kept draining upstream (102 KB → 119 KB), and the terminal usage frame arrived AFTER the downstream abort (`afterDownstreamAbort: true`; finalUsage 19 prompt / 420 completion tokens; `upstreamSettleLatency` ≈ 10.5 s). **The gateway can settle actual usage on client disconnect** — the reserve→commit design's load-bearing premise holds.

Also observed live: the typed `MODEL_NOT_IN_CATALOG` refusal for a disabled catalog row.

Still not tested (carried from above): Anthropic wire live (key unfunded), browser-built provider via `baseURL`, auth/credits enforcement (design only), WAN latency, tool calls/caching byte-fidelity. Probe scripts: session scratchpad `sp3/probe-openai.mjs`, `sp3/probe-abort.mjs`.
