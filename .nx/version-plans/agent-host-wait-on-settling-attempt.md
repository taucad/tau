---
agent-host: patch
---

A generation step whose chat still has a model attempt the gateway has not settled now waits for it instead of ending at once. The step asks again after 0.25, 0.5, 1, 2, 4 and 8 s (about 15 s in all) on the session's clock, and stops waiting when its signal aborts. If the attempt settles in that time, its row is recorded and the step proceeds. If it is still pending, the run ends `MODEL_ATTEMPT_PENDING` as before. A run started right after a stopped one, as a queued message's Send now does, no longer pauses while the stopped call is still settling.
