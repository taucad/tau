---
agent-host: patch
---

`@taucad/agent-host` stores an assistant reply as the provider wrote it. The harness no longer rewrites `\(…\)` and `\[…\]` math delimiters in the final text and thinking blocks before they reach the session log, so a signed thinking block stays bound to the bytes the provider signed and every later request replays an unedited reply. `normalizeLatexDelimiters` remains exported; a renderer calls it on the text it is about to show.
