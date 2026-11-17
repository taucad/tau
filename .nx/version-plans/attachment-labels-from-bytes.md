---
__default__: patch
---

Label chat attachments from their bytes. `materializeAttachments`, stored screenshot captures and the ACP/MCP media writer name an image by what its bytes are, through the new `sniffAttachmentMediaType` and `attachmentMedia` table in `@taucad/agent-host/wire`. A PNG or WebP recorded as `image/jpeg` is sent as `image/png` or `image/webp`, so a chat a provider refused for the mismatch resumes without its log being rewritten.
