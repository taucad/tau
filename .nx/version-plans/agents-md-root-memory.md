---
agent-host: minor
---

Tau's agent reads a project's instructions from `AGENTS.md` at the project root, the path the AGENTS.md convention names, and no longer from `.tau/AGENTS.md`. The file is re-read whenever it changes, so a turn carries what it says now. A project that kept instructions at the old path moves the file to its root to keep them in context.

The reminder that carries the file is one descriptive sentence in place of the `<memory_guidelines>` rules: it says the block is the project's instruction file as it reads now. When to add to the file is left to the agent. The system prompt gains a short `<project_instructions>` section saying that a project may carry `AGENTS.md`, that the agent may create or edit it, and that a subdirectory's own `AGENTS.md` covers the files under it.
