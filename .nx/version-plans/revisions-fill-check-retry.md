---
revisions: patch
---

Retry a large-object fill check that throws, on its own and with backoff, for live and linked checkouts alike. Before this change a thrown check was only logged, and a checkout that no later capture, pull or edit reached never got the fill's word, so its readiness stayed below `filled`. A retry waits 0.5 s, 2 s, 5 s, 15 s, 30 s and then every 60 s, and a newer tree write's own fill supersedes it. `checkLargeObjects` (Try again) pressed while a tree write runs now waits for that write rather than starting a second fill of the same tree. It checks again only when the write opened no new generation, or left the one it opened without an answer.
