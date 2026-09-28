---
slicer: minor
---

`sliceWithBambuStudio` stops a Bambu Studio that has not finished within two minutes plus one minute per MiB of STL (was a fixed five minutes) and rejects with the new code `BAMBU_STUDIO_TIMEOUT` (was `BAMBU_STUDIO_SLICE_FAILED`), whose message says to slice again.
