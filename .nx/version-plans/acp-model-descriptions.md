---
host: minor
agent-host: minor
---

An external agent's discovered models carry the agent's own description (`ExternalAgentDescriptor['models'][number].description`, optional, at most 256 characters). A default alias names the model it stands for there (Claude Code's `default` is described as "Opus 5.5"), so a picker can show the model that actually runs.
