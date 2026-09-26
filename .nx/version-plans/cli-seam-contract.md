---
cli: minor
---

`tau agent` speaks the keyed seam contract. Each invocation, and each TUI keystroke, mints one `commandId` and re-sends it unchanged when the daemon connection heals, so the daemon applies the command once. Chats are followed with one outstanding long-poll `read` (bounded by `maxBytes`) instead of a 200 ms poll, and a reader that meets `cursor-ahead` or `identity-mismatch` refolds from the start. A refused command prints its code, message and a hint from the refusal registry; a lost connection reports that the command may not have been applied and exits with its code.

Breaking: `HOST_ANSWER_UNEXPECTED` and `LOG_READ_CLAMPED` are gone, and plain output is `operation/run/status/cursor[/state]`.

Release status: `@taucad/host`, `@taucad/cli` and `@taucad/mcp` are withheld from release until the release owner rules SC-Q2 (`@taucad/chat` bundled by both host and mcp) and the remaining SC-A11 bundle-ownership conflicts (charter W4 row: publish `@taucad/rpc` as a leaf "or else withhold"). Publishing these three before that ruling ships a private library in two bundles.
