---
agent-host: minor
---

Run every chat through one run actor. `TauAgentHost.command(input)` is the single entry point: it answers every command with a durable, keyed `CommandAnswer`, one run per chat at a time, and refuses a live chat with `CHAT_RUN_LIVE` before writing anything. `start`, `resume`, `cancel`, `resolveInterrupt` and the other verbs remain as adapters over it; `waitForAdmission` now answers once the run is `admitted`. A restarted host settles a run the last one left open (`RUN_ABANDONED`) instead of continuing it, and every resume opens a new attempt, with or without placement.

Breaking:

- `xstate` `^6.0.0-alpha.59` is a new required peer dependency.
- `ModelTransport.funding` is required. It is `{ type: 'unfunded' }` for a self-hosted transport, or a funded facet (`InvocationFunding`) with `usesBillingAttempt` and `resolveInvocation` (`InvocationResolutionRequest`). The optional `usesBillingAttempt` and `lookupAttempt` members are removed, `GatewayFundedOperationProtocol` is no longer exported, and `MODEL_ATTEMPT_IN_DOUBT` is gone.
- `ModelInvocationBinding.status` is removed; a binding carries only `operationId`.
- `RunLifecycleCommands` is no longer exported.
- `InterruptApprovalPort.pause` and `resume` are optional. The host never calls them, nor the `interruptPort` option (kept for its last caller until W6 removes it).
- `AgentSession.prompt` and `continue` now resolve to the run's outcome (`AgentRunOutcome`).
- `assumeLeadership` takes a `string` or a `number`.

New options: `placement` (a `TurnPlacementPort`; placement ports and their settlement rows are exported), `lostReplyRetries`, `delays` and `clock` (`HostClock`, `StreamStallBound`). A tool may declare `executionMode: 'sequential'`, which runs its batch one call at a time. `@taucad/agent-host/wire` exports `attemptReceiptSchema` and `InvocationResolution`.

Model attempts: a funded reply lost in transit is resolved and recorded, then retried in the same run up to `lostReplyRetries` times; a cancel that lands during the retry stops it before any further funded call. A funded transport may report its account (`funding.principal`), which each `model.invocation-prepared` row records. An attempt another account funded is never looked up or voided: every open attempt is checked before any is recorded, and resuming is refused `MODEL_ATTEMPT_OTHER_ACCOUNT`. A `principal` lookup that fails is refused `UNAUTHENTICATED`.

Compaction state now persists across admissions: the breaker's strike count, and the per-call overhead the last pass measured (`CompactionTrace.anchor`). A session reads its history from the log's incremental reduction (`messages()`) and refuses a history the log flagged broken (`HISTORY_INVALID`). A model stream that sends nothing for five minutes fails `MODEL_STREAM_STALLED`, on the host's `clock` (`delays.streamStall`). Each tool result is durable as soon as its call ends, and results are kept in call order.

External agents: a turn now carries its `attempt`, and `approve` resolves only after the resolution is durable. `closeChat` is called only after the run has settled. When a chat reopens, an approval that no host will answer is resolved with `EXTERNAL_AGENT_RECOVERY_UNKNOWN`. Session state an agent reports after its turn ends is still recorded while the chat is open; after `close` it is refused `HOST_CLOSED` and never reopens the log. `ledger` after `close` answers from the ledger the close left, and is refused `HOST_CLOSED` for a chat the host never read.
