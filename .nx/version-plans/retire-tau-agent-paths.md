---
filesystem: minor
revisions: minor
---

`.tau/AGENTS.md` and `.tau/skills` are no longer rows of the path registry. A project's agent files live at the paths other agents read, `AGENTS.md` at the project root and skills under `.agents/skills`, where they are authored and versioned like any source file. A path under either retired `.tau` name now answers the reserved `.tau` default: unversioned, and readable and writable by the agent. The generated `.gitignore` block loses `!/.tau/skills` and `!/.tau/AGENTS.md`; its head is `/.tau/*`, `!/.tau/parameters`, `!/.tau/machines`.

Breaking: a project that still keeps files at `.tau/AGENTS.md` or under `.tau/skills` records their removal at its next revision. The files stay on disk; move them to `AGENTS.md` and `.agents/skills/<name>/` to version them again.
