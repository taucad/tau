---
agent-host: minor
---

A Tau Cloud host can ask the gateway what became of a model attempt and act on the answer. `createTauCloudGatewayModelTransport` now carries a `funding` facet (`InvocationFunding`) whose funded branch offers `resolveInvocation({ attemptId, signal })`. It answers one `InvocationResolution` from `@taucad/agent-host/wire`: `pending`, `unavailable`, `terminal` with the outcome and the exact charged credit atoms, or `voided`, meaning the gateway never admitted the attempt and never will. A sign-in failure throws `UNAUTHENTICATED`, as `stream` does, and an answer this build cannot read throws `MALFORMED_RESPONSE`. The wire module also exports `attemptReceiptSchema`, the reader of the attempt route's answer. `ModelTransport` gains `funding` as an optional member for now; the run actor makes it required and removes `usesBillingAttempt` and `lookupAttempt` in the same release.
