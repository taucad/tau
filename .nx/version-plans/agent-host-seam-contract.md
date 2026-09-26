---
agent-host: minor
---

One seam contract for every agent host. The new `@taucad/agent-host/wire` subpath owns the vocabulary: one strict payload schema per verb (`commandPayloads`), the `CommandAnswer` every command gets (`applied`, `replayed` or `refused`, with an `effect`), the long-poll `read` and its `ReadAnswer` (a batch, or a refusal; never a clamp), the hello (`{ wire: 2, build }`) and read limits, and one refusal registry (`refusals`, `refusalOf`, `isResumable`) that apps/api's gateway codes and every host code are typed against.

Breaking:

- Commands are keyed: `HostCommand` is `{ type, commandId, payload }`, and a re-send with the same `commandId` is answered `replayed` from the chat's applied set instead of running twice. The owner half is `createCommandOwner`; the host's verbs accept `commandId`, and `TauAgentHost` gains `ledger` and `read`.
- `createNodeAgentLauncher` answers `execute(HostCommand)` with a `CommandAnswer`, serves `read`, and streams `liveEvents({ chatId, signal })` per chat. The `tail` verb, the durable `events` stream and the `request` call are gone; `attach` answers the run's projection as `details`.
- `serveAgentChannel(endpoint, launcher, { build, keepaliveInterval? })` requires the owner's build and keeps clients alive; `createAgentChannelClient({ connect, livenessTimeout?, sessionKey? })` dials, redials, and re-sends every unanswered command with its key. `AgentChannelError` is removed; a lost connection rejects with `ChannelClosedError`, re-exported from `@taucad/agent-host/channel-client`.
- Removed from the root export: `agent-wire`'s schemas and types (now under `./wire`), `admissionConfigFor`, `agentHostRefusalCodes`, `AgentHostRefusalCode` and `gatewayModelErrorCodes`. `start` refuses the dead `mode` and `baseRevisionId` fields, and a run id past 94 printable characters. `externalAgentDescriptorSchema` no longer defaults `models`.

Added: `followChat` and `readFolded`, one reader over `read` that refolds from row 0 on a reset. Compatibility: during the compatibility window a daemon still answers a v1 client (the `request` call, the all-chat `events` stream, and a keyless `start` replayed by its run id), and `createAgentChannelClient` speaks v1 to a daemon whose hello names no wire. There it replays reads only and does not re-send a lost command. A hello naming another wire is refused with `WIRE_VERSION_UNSUPPORTED`.
