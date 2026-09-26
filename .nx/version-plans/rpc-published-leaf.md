---
rpc: minor
---

Publish `@taucad/rpc` as a leaf package again (host-agnostic R3), from `packages/rpc`, with `zod` as a peer and no private workspace dependencies. The channel now answers a readable request it cannot serve with a coded error instead of dropping it. An owner end sends an `lk` keepalive every `keepaliveInterval`, and a client end that has seen one rejects its calls with `PEER_UNRESPONSIVE` after `livenessTimeout` of silence. Every close carries a code (`ChannelClosedError.code`).
