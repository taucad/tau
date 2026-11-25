---
agent-host: patch
---

Every model call a run makes now names that run in its gateway attempt id (`<runId>:<attempt>:<n>`), on an unfunded transport too. The API files such a call under the run's trace, so a desktop build without `TAU_CLOUD_ENABLED` no longer splits each model call into a Langfuse trace of its own. A funded transport's prepared, durable ids are unchanged.
