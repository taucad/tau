---
host: minor
---

The daemon serves the keyed seam contract from `@taucad/agent-host/wire`: every command carries a `commandId` and gets a `CommandAnswer`, durable rows are pulled with the long-poll `read`, and the agent channel sends the owner's build in its hello and keeps clients alive. The revisions turn watcher and the run reporter follow each chat with `read` instead of the removed launcher `events` stream.

Release status: `@taucad/host`, `@taucad/cli` and `@taucad/mcp` are withheld from release until the release owner rules SC-Q2 (`@taucad/chat` bundled by both host and mcp) and the remaining SC-A11 bundle-ownership conflicts (charter W4 row: publish `@taucad/rpc` as a leaf "or else withhold"). Publishing these three before that ruling ships a private library in two bundles.
