---
agent-host: minor
---

`@taucad/agent-host` lets a page verify a chat's logs without opening a host. `leaseChatLogs` (`@taucad/agent-host/browser`) takes the leadership lock a tab takes before it opens a chat's writer, for every named chat, so no tab can start a run or append while it holds; it refuses with the chat another process keeps leading past its wait, and reports a lease a peer stole as lost. `unsettledLogRun` (`@taucad/agent-host`) reads a chat's own log bytes through the same parse and ledger fold a writer uses and answers its current run when that run is admitted, running or paused.
