---
host: minor
---

External agents no longer receive the project's `AGENTS.md` from Tau. An ACP turn used to embed the `memory` record of the client's context payload as a `tau://memory` resource on every prompt, so a session held one more copy of the file each turn. The agent runs in the project and loads `AGENTS.md` from its own working directory by its vendor's rule, so Tau no longer re-sends it. `tau://agent-guidance` (first prompt), `tau://skills` and `tau://snapshot` are sent as before, and Tau's own agent still receives the file through the `memory` record.

Breaking: an ACP turn no longer carries a `tau://memory` resource, and `clientContext.memory` has no effect on what an external agent is sent. An external agent that read the project's instructions from that block now relies on its own loading of `AGENTS.md` from the working directory.
