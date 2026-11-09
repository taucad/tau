---
rpc: patch
---

`@taucad/rpc`'s `createBridgePort` now disposes its bridge server when the port is disposed. Before, the server's watch registrations were released only by the port's `close` event, which a browser does not fire on a port its own realm closed. Every watch served through a disposed bridge port therefore stayed registered for the authority's lifetime. The peer still learns of the closure from its port, as before.
