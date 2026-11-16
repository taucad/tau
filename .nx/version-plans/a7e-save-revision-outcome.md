---
revisions: minor
---

`awaitCheckoutCuts` now resolves with what happened, as a `CheckoutCutsOutcome`:

- `recorded`: one checkout minted a revision and the rest had nothing to save.
- `nothingToRecord`: every checkout answered a plain `nothingToSave`.
- `refused`: no checkout was there, a turn held a checkout, or a checkout answered `nothingToSave` with `heldBy` or `waitFor`.

It still rejects on `cutFailed`, `casLost` or the deadline. The root `nothingToSave` event, and the event the machine emits for it, may carry `waitFor` with the git operation the cut waited on.
