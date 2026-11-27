---
host: patch
---

Claude Code now finds Tau's system skills. The host publishes each skill under both `.agents/skills` (Codex) and `.claude/skills` (Claude Code) in the directory it adds to the ACP session, because Claude Code only discovers skills in an added directory's `.claude/skills`.
