---
filesystem: patch
---

A composed view's `apply` now refuses a `lifecycle` changeset with `EPERM` for both the agent and the user consumers, before it checks any path. A lifecycle changeset takes the project token exclusively, and only the authority itself may apply one.
