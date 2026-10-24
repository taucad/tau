---
native-process-core: patch
---

`openNativePreparation` takes an optional `hostPath`, the installation whose link records the closures it prepares. It defaults to the running script as before; a packaged app passes its executable, since its `argv[1]` is no path and the next startup collection would drop that link.
