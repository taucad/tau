---
runtime: patch
---

A kernel whose `initialize` refused a file (such as a native kernel answering `KERNEL_NOT_PREPARED` before its runtime is prepared) no longer keeps refusing that file after a later operation initializes it: the runtime drops the earlier selection's refusal once a selection completes, so the next evaluation runs the kernel instead of repeating the stale issue.
