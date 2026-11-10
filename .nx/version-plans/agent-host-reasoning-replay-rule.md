---
agent-host: patch
---

`@taucad/agent-host` replays a model's native reasoning only under the prefix that minted it. The gateway transport recomputes each assistant row's prefix digest on every request; a same-model row whose recorded digest no longer matches (after tool-result clearing, a summary, a mode or tool-list change, an attachment eviction, or with no stamp at all) is sent without its thinking blocks and tool-call thought signatures, so a provider that binds reasoning to its prefix no longer refuses the request. The durable row is untouched, and the reply's `metadata.prefix` records how many blocks the request replayed and how many the break left out.
