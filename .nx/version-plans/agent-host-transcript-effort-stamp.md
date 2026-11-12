---
agent-host: patch
---

`@taucad/agent-host` binds the effort markers a transcript carries into the prefix stamp. A chat whose replies were minted with their effort level in the transcript and is later sent without it (the capability off, a catalog flag removed, an older client) records one `settings` break and leaves the earlier replies' native reasoning out, instead of replaying signed thinking under a prefix that lost its markers. Adopting transcript effort still records one `settings` break and keeps earlier reasoning. The codec epoch moves to `pi-ai@1.4.0/3`, so a row stamped by an earlier build no longer replays its reasoning and the first reply after the upgrade records one break.

The package entry exports `prefixBreakCauses` and the types `PrefixBreakCause`, `PrefixStamp` and `LedgerPrefixBreak`, which describe the stamp each reply's row carries and the breaks the chat ledger counts. `gatewayErrorCodes` and `refusals` gain `REASONING_REPLAY_REJECTED`: the provider refused native reasoning replayed from an earlier turn; it is never retried, and the card offers another model.
