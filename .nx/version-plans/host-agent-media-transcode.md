---
__default__: minor
---

Store ACP agent images Tau cannot keep as sent as the JPEG they convert to. `@taucad/host` now converts an agent's AVIF, GIF or oversized image through the host runtime's raster transcoder (`normalizeImageAttachment` from `@taucad/agent-host/wire`) before filing it in the chat's attachments; canonical JPEG, PNG and WebP within 1568 px and 1 MiB are filed unchanged without starting a runtime. `createAcpExternalAgentPort` and `createProjectHost` accept an optional `mediaTranscoder` (types `AgentMediaTranscoder` and `AgentMediaTranscoding`); without one, agent media is filed as before. `serveHostRuntime` reports `transcodeSources`, the formats its runtime converts to JPEG, which a runtime child passes to `tau serve` in its `ready` message.
