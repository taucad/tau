---
agent-host: minor
---

`@taucad/agent-host` exports `createReplayFacts` and `isBytePrefix` from its root, so a page can read a chat's own `events.jsonl` from the file as the projection facts a host read would send, and extend that view while the held bytes stay a prefix of the file's. The view is facts-only: no writer, lock, ledger or history.

`EventLogStorage` and `EventLogAppender` gain an optional `touch()`, which refreshes the writer's lock marker. The Node writer refreshes the marker's modification time through the handle it holds. A provider writer rewrites its own marker and leaves a successor's alone. The host calls `touch()` on every heartbeat tick of a live run, outside the chat's write chain and before any publish, and keeps calling it while a held chain or a hung publish stalls the tick.

A provider writer's marker is one epoch-millisecond line; any other marker, including an older Node build's bare `pid` line, is a Node writer's. Each kind of writer honours the other's marker while the newer of the log's newest row and the marker's modification time is within `foreignRunStaleMilliseconds`, and takes it over past that bound. A provider open that meets a fresh Node marker refuses `WRITER_LOCKED`. A Node open now judges a provider marker by that bound instead of treating it as held forever. A provider open still takes another provider's marker over at once, under the chat's Web Lock.
