---
agent-host: patch
---

Land compaction at a fifth of the context window. A summary now keeps at most that much history verbatim, and clearing tool results stands in for a summary only when it reaches the same point by itself, so each pass frees most of the window and the next one comes much later.
