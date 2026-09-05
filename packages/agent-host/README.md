# @taucad/agent-host

Portable browser-safe agent host and durable session log core.

The root export contains the pure event vocabulary, JSONL codec, reducer, and
W1-W6 host waist types. Storage implementations are isolated behind
`@taucad/agent-host/browser` (OPFS sync access handles) and
`@taucad/agent-host/node` (Node filesystem append).

The canonical session record is `.tau/chats/<chatId>/events.jsonl` in the
workspace owned by the active run host.
