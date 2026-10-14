---
agent-host: patch
---

A claim that joins a chat's incarnation as it closes on a fenced answer now opens a new incarnation, which reads the log again. Before, the claim a lease holder's release sends could land on an incarnation that was still closing on a `LEASE_HELD_ELSEWHERE` refusal from before that release. The claim then returned without settling the attempt, and its lease stayed until something else claimed the chat.
