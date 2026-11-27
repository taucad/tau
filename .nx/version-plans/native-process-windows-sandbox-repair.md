---
native-process-core: patch
---

A Windows native launch that the sandbox helper refuses with a fault its elevated `setup` repairs (after an app update the installed runner copy differs from the new helper, or the sandbox account, profile, network rules or volume grant went missing) now makes the next launch run the configured `setup` again, one administrator prompt, instead of trusting `status`'s install record and refusing every later launch. A process that may not run setup names the repair in its refusal.
