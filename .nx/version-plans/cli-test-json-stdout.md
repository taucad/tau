---
cli: patch
---

`tau test --json` writes only its record to stdout. A model's own console output, such as replicad's "Font … already loaded", and a kernel worker's forwarded stdout now go to stderr instead of corrupting the record, as they already did for `tau mcp`.
