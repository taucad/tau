---
agent-host: patch
---

A claim refused after a tab took a chat's lock no longer leaves that tab leading with no writer. A chat still closing its log from an earlier session (`WRITER_LOCKED`) is claimed again each second until the still-closing bound, then the lock is released so another tab or the next reconcile can claim it; any other refusal releases it at once. A refused term is released only once no command is running in it, and a command that opens the writer ends the retry. Node's reconcile retries the same refusal to the same bound, counted from the first refusal, instead of firing one claim and forgetting it; closing stops the retries without waiting for a claim in flight. `AgentLauncherOptions.onClaimRefused` reports each refusal. An `attach` from a second process that the live writer refuses no longer reports a takeover of that writer's run.
