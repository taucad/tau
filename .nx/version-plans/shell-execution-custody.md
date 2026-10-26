---
native-process-core: minor
host: minor
revisions: minor
---

Contained shell launches now run under durable execution custody. **Breaking:** `ShellProvider` requires `prepare`, `inventory`, `recover` and `release`, and every `ShellLaunch` names the `executionId` its preparation returned; a provider refuses an unprepared launch before anything starts. The sandbox provider hands each execution's lock to its supervisor and opens a start barrier only after the supervisor and the staged shell are durably registered (macOS Terminal launches gate over their own PTY), and `createSandboxShellProvider` takes a `custody` namespace. The host shell service holds an agent command on its run's turn lease before launch, deletes private roots only after a confirmed stopped claim, then releases the run hold and the receipt, recovers an earlier host's receipts at start, and blocks a checkout whose cleanup it cannot confirm. `@taucad/revisions` adds the turn store's execution holds, a strict lease parser and closing-turn admission: a turn whose command is still held is not settled.
