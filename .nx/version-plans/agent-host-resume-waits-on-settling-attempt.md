---
agent-host: patch
---

A Resume whose chat still has a model attempt the gateway has not settled now waits for it, as a run's first generation step already does, instead of being refused at once. It asks again after 0.25, 0.5, 1, 2, 4 and 8 s (about 15 s in all) on the host's clock. If the attempt settles in that time, its row is recorded and the run resumes. If it is still pending, the Resume is refused `MODEL_ATTEMPT_PENDING` as before. Resuming right after Stop, while the stopped call is still settling, no longer fails.
