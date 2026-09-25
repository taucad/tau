---
agent-host: minor
---

Fold every chat log through one exported ledger, `foldChatLedger`, and fence stale writers. Breaking: `createNodeEventLog`, `createOpfsEventLog` and `createProviderEventLog` require `access: 'read' | 'write'`, and a read open returns a reader that holds no lock. `replayedStartOutcome` now takes `(ledger, runId)` and can answer `recover`. An OPFS open whose handle another worker holds is refused `WRITER_LOCKED` instead of `STORAGE_NOT_WRITABLE`. A writer whose log another writer changed is refused `LOG_FENCED` and writes nothing. Unreadable lines are quarantined and unknown rows kept opaque, so a chat still reads; a run whose history is not intact is refused `HISTORY_INVALID`. `foldReadAnswer` replaces `alignLogBatch`, and a read past the end is refused instead of clamped. Rows may carry `epoch`, `commandId` and `attempt`.
