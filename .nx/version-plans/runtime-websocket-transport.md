---
runtime: minor
---

Add the WebSocket runtime transport: `@taucad/runtime/transport/websocket` (`webSocketTransport`, browser-safe client for a remote kernel host, with the consumer's own filesystem optionally served over a second socket) and `@taucad/runtime/transport/websocket-host` (`webSocketHost`, Node `ws` server running one kernel worker per connection with an origin allowlist and a server-side heartbeat).
