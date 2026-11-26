---
agent-host: minor
---

`@taucad/agent-host` exports `createReplayFacts` and `isBytePrefix` from its root, so a page can read a chat's own `events.jsonl` from the file as the projection facts a host read would send, and extend that view while the held bytes stay a prefix of the file's. The view is facts-only: no writer, lock, ledger or history.

`EventLogStorage` and `EventLogAppender` gain an optional `touch()`. The Node writer implements it by refreshing its lock marker's modification time through the handle it holds, and the host calls it on every heartbeat tick of a live run, outside the chat's write chain and before any publish. A provider writer opening a chat log now honours a Node writer's marker (anything other than one numeric line) while the newer of the log's newest row and the marker's modification time is within `foreignRunStaleMilliseconds`, refusing `WRITER_LOCKED`; past that bound it takes the marker over. A provider marker is taken over as before.
