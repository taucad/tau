---
runtime: patch
---

`@taucad/runtime` registers a kernel's dependency watch over the filesystem bridge in the change-set form, so a many-file write reaches it as one frame (it falls back to the per-path form on a host without one), and the machine settings owner watches its settings files through `watchChangeSets` when the view offers it.
