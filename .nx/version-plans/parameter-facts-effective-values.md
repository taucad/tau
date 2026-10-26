---
runtime: patch
---

An evaluation's worker facts now count `parameters.modified` against the values the kernel receives, with defaults filled in. Before, a leaf the caller left out was compared as missing, so opening a model with its defaults reported every declared leaf as modified; now it reports `modified: 0`, and only a leaf whose value differs from its manifest default counts.
