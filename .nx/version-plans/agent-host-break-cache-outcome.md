---
agent-host: patch
---

`@taucad/agent-host` records what each prefix break cost in prompt cache. A `LedgerPrefixBreak` gains an optional `cache` (`'hit'`, `'partial'` or `'miss'`): the cache share of the request that broke the prefix, read from the usage its reply reported and classified by the gateway's rule (a hit reads at least half of the prompt from cache). It is absent when the reply reported no prompt tokens.
