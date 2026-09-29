---
cli: minor
---

`tau agent tail` reports `LOG_READ_CLAMPED` when a daemon answers a read from a cursor other than the one asked for, instead of rewinding silently, and folds the chat state through the agent-host ledger.
