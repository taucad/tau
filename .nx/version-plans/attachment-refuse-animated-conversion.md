---
__default__: patch
---

`normalizeImageAttachment` in `@taucad/agent-host/wire` now refuses a conversion whose output is an animated WebP, as it already refused one of the wrong format or size.
