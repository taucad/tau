---
host: patch
---

An external agent that exits keeps the stderr lines it wrote just before it exited. Node reports a child's exit while its stdio may still be draining, so the exit report could miss the agent's last words. The connection now reports the exit once stdio has closed, or one second after the exit when a process the agent started still holds the pipes open.
