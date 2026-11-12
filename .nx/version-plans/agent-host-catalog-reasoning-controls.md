---
agent-host: patch
---

`@taucad/agent-host` reads two reasoning controls from the model a request names. `reasoning.effortInTranscript` carries the reasoning level inside the transcript on the Anthropic and OpenAI models that read it there, so changing the level mid-chat keeps the prompt cache and records no `settings` prefix break; each reply's `metadata.reasoningLevel` records the level it ran at. `reasoning.replayBinding` (`'drop'` or `'refuse'`) tells Anthropic what to do with a replayed thinking block whose prefix changed; a block the provider reports it dropped is counted in `metadata.reasoningDroppedByProvider` and as an `unsanctioned` prefix break. A request that sets neither is sent as before.
