---
agent-host: minor
---

A chat's settings no longer edit the request prefix. `@taucad/agent-host` now declares every tool an admission grants (`allowedTools`) whatever its `toolChoice` is, and applies the tool choice where a call is made: a call to a declared tool the choice leaves out is answered `TOOL_DISABLED` and the run goes on. A turn admitted with `toolChoice: 'none'` therefore still declares its tools. The new `chatStateMessage` builds the context message that states a chat's mode, testing switch and tool mask; the host adds it to a turn's context only when it differs from the newest one the conversation carries, and restates it after a compaction summary. Toggling a setting keeps the provider's prompt cache and records no prefix break.
