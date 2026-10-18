---
filesystem: minor
---

The node filesystem port carries watch events in batches (protocol version 6): the events one native callback reports cross as one frame, and `NodeFsProviderClient.observe` delivers them as one fact batch. `NodeFsChannel.watchBatches` exposes the batched stream. `NodeFsProvider.watch` keeps excluded `prefix/**` subtrees out of the native watcher and drops excluded events before it stats them.
