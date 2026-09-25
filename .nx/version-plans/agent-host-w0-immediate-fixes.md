---
agent-host: patch
---

Fix run bookkeeping defects in the host. Re-appending an identical record after a reload is a no-op. A run that fails during construction records a coded `failed` row before its reservation is released. An external run keeps its reservation until it registers. A reply that stopped with an error or abort no longer counts as completion; a terminal receipt continues the step under a new attempt key, and an unresolvable attempt fails with `MODEL_ATTEMPT_IN_DOUBT`. Early-started tools settle when a step is cancelled or fails, and context overflow is detected from the provider's refusal alone.
