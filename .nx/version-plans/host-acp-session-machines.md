---
host: minor
---

ACP sessions are now owned by two XState machines: one parent per ACP port, with one child per chat. Only resting sessions are evicted or closed when idle. A closing session keeps its chat's slot until its adapter's process group has exited. A cancelled turn is answered within 2 s, or it is answered after the close ladder (`session/close`, then SIGTERM, then SIGKILL to the group) has ended the adapter. A second turn for a busy chat is refused with `CHAT_RUN_LIVE`. The MCP endpoint admits a bound turn's tool calls past its token's expiry, up to `hostMcpLeaseCeiling`. The session record, including a usage limit's reset (`AcpLimitReset`), is written at open and at every outcome, so the limit survives eviction and a host restart.

The new exports are `hostMcpLeaseCeiling`, the `AcpLimitReset` type, the `limit` option of `openAcpSession`, and the optional `now` of `createAcpExternalAgentPort`. `AcpSession` gains `usage`, `limit` and `title`, and `SpawnedAcpAdapter` gains `signal()`.

Two behaviours change. `spawnAcpAdapter` now spawns the adapter detached, in its own process group, so a ^C in the terminal no longer reaches it. `SpawnedAcpAdapter.close()` now sends SIGTERM to the whole process group, not only to the adapter process.
