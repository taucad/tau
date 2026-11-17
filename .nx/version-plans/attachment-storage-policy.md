---
__default__: minor
---

Decide what every host stores for a chat attachment with one function. `normalizeImageAttachment` in `@taucad/agent-host/wire` probes the bytes and stores JPEG, PNG or static WebP within 1568 px and 1 MiB unchanged, converts any other image the host has an edge for to JPEG through a caller-supplied transcode port, and otherwise returns a refusal that names the format. `attachmentMedia` is now the only table of stored media types: the attachment path patterns of `@taucad/agent-host` and `@taucad/revisions`, the ACP/MCP media writer of `@taucad/host` and the stored screenshot captures read it through `attachmentExtensions`, `attachmentExtensionOf` and `attachmentImageMediaTypes`. `@taucad/revisions` now depends on `@taucad/agent-host` for that table.
