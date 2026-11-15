---
agent-host: minor
---

`externalAgentDescriptorSchema` accepts an optional `fixCommand` (1 to 256 characters): the one command that clears a refused agent's `refusal`, resolved by the host for its own platform and shell. No host emits it yet; this release lets every parsing tier accept it before one does.
