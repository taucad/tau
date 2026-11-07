# Agent observability: the Langfuse plane

This module admits agent evidence, keeps it in an outbox, and delivers each admitted receipt to Langfuse as one OTLP observation. It also reads that history back for the scorecard and erases it on request. The rules are in the [agent observability policy](../../../../../docs/policy/agent-observability-policy.md). This page explains what Langfuse holds and how to read it.

## What Langfuse holds: summary facts only

Langfuse is a **summary-only plane** under policy `purposes-v1`. Every observation carries ids, vocabulary values, counts, timings and token usage. It never carries prompts, model output, tool arguments, tool results, file contents or error messages.

- Host facts (`authority: host-reported`) come from the browser host's committed rows (`libs/agent-observability/src/projection.ts`, mapper `host-turn-v4`). The host projects tool, check and outcome facts, the first time a run's text was shown, and ratings (on the feedback plane).
- API facts (`authority: api-reported`) are provider attempts (`model-invocation-evidence.ts`, `api-provider-v2`) and ledger settlements (`settlement-evidence.ts`, `api-settlement-v2`).
- `coverage.input` and `coverage.output` are `omitted` on every summary fact. Host facts report `usage: unsupported`, because usage and cost live on the provider and financial facts. An empty Input or Output panel is expected and does not mean data was lost.
- Account, project, run, attempt and record ids reach Langfuse only as keyed or one-way digests (`langfuse.user.id`, `metadata.run`, `metadata.attempt`, `metadata.source`, `metadata.semantic`). Only the API can link a pseudonym back to an account.
- A content plane exists in the contract but is separately granted. This document does not widen it, and nothing here changes which fields are collected.

## Why host facts show `protection: unknown`

`metadata.protection` is the **strictest protection across the receipt's lineage**, recorded by the server (`evidence-delivery.ts`). The rank is `free` < `unknown` < `pro`. The host claims only what it knows (`ProjectionContext.protection`), and the API only ever makes that claim stricter. In practice the API-reported facts of a run show `pro` and the host-reported facts of the same run show `unknown`.

This is intentional (charter D12). Do not "fix" it from the AI-training decision. A Langfuse filter on protection should treat `unknown` as at least as strict as the strictest known value.

## How to read a run

Each run is **one trace** with **one root**:

- The trace id is a digest of the environment, principal and run (`observationIdentity`), so every fact of the run lands in the same trace.
- The root is a synthetic span named `Tau agent run`. Its id is `runRootSpanId(environment, principal, run)`. `otlpBody` sends it together with each fact span, because if a child's parent was never sent, Langfuse renders the child as another root. No single fact is guaranteed to arrive: a run may end without an outcome, and receipts deliver independently. The root's id is deterministic, so repeated sends upsert one root instead of adding new ones. Its attributes are the same on every send: trace name, user, session, environment, run group, mapper and policy, plus `metadata.root = true`. It carries no release and no fact fields.
- The root is a point in time at the start of whichever fact was sent last, so its own time is not the run's duration. To time the run, look at its children, or at the trace's span from first start to last end. If a run's facts straddle midnight UTC, Langfuse may keep one root row per day.
- Every fact span is `tau.<family>` with `parentSpanId` set to the run root. The scorecard read (`langfuse-scorecard.ts`) and the delivery reconciliation (`langfuse-client.ts`) count only `tau.`-prefixed rows, so the root is never counted as a fact.
- **Provider spans** (generations) start at the relay's start and last as long as `phase.provider-wait@api-relay` plus `phase.provider-stream@api-relay`. `completion_start_time` marks the first relayed byte, so Langfuse's time to first token is the wait, and `end − completionStart` equals the stream phase.
- **Tool spans** start when the call started and last as long as `phase.tool@host-recorded`.
- Every other fact is a point at its `occurredAt`. The raw intervals stay in `metadata.intervals` and the per-phase totals stay in `metadata.phase.<name>@<domain>`. Within a run, add up phase time as the union of intervals across facts, not as the sum of span durations.
- **Release.** `langfuse.release` is the web build's `TAU_RELEASE` on host facts (the page passes it to the agent-host worker in the provide message) and the API image (`FLY_IMAGE_REF`, last path segment, the same label as `service.version` and the Sentry release) on API facts. When no build is known the release is `unknown`. The legacy `0000000` label is reported as `unknown` too.
- **Failures.** A failed provider attempt (`stop: error`), a failed tool call and a failed run outcome get `level: ERROR` and a status message. A failed outcome names its ending code and that code's owner and retry class, for example `run failed: MODEL_ATTEMPT_PENDING (owner host, retry wait)`. The same values are in `metadata.fact.code`, `metadata.fact.failureClass.owner` and `metadata.fact.failureClass.retry`. When a `wait`-class code was recorded as `RUN_ABANDONED`, the code shown is the wrapped one, because it names the cause; the retry class `wait` on a failed run marks that rewrite. An outcome from an older host shows `run failed: unclassified`.

To find one run, filter the v2 observations list by `traceId`, read the root and its children, and sort by `startTime`. Paginate with `cursor`, not `page`. Sessions (`langfuse.session.id`) group a chat's runs.

## Delivery and versions

- The OTLP request body carries one fact span and its root. The vendor's answer covers that one fact: a partial rejection of either span rejects the receipt, and the receipt is never resent.
- `observationMapperVersion` changes only when the closed metadata that the scorecard reads changes. The run root, a span's parent, its time range, its level and its status message are structure. The failure fields are additional keys. So the 180-day history stays scorable under `langfuse-v4.3`.
- A host outcome fact with `failureClass` and `code` is refused (`EVIDENCE_INVALID`) by an API built before those fields existed. The host drops a refused envelope and counts it (`libs/agent-observability/src/delivery.ts`), so the only cost is lost evidence. Agent work never waits on delivery.
