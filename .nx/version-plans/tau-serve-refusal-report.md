---
cli: patch
host: patch
---

`tau serve` now prints why each external agent is unavailable: its code and message, and on the next line `Fix: <command>` when a command clears it. The daemon's in-process `agent` ready event carries the refusals as `externalAgentRefusals`; it is not a wire field.
