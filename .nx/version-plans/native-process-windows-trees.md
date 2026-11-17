---
native-process-core: patch
---

On Windows, `readArtifact` compares an artifact's physical path with the physical artifact root, so a root under a temporary directory spelled with an 8.3 short name (`C:\Users\RUNNER~1\…`) no longer refuses every artifact as invalid. `terminateProcessTree` still ends the child when `taskkill` cannot start and Windows reports that by throwing (`spawn UNKNOWN`) rather than through `'error'`. A host's exit hook now also ends the trees of its Windows workers with a synchronous `taskkill /T /F`, ready for when native workers start on Windows.
