---
agent-host: minor
host: minor
---

Desktop and `tau` daemon sessions store screenshots as chat attachments, as the web has since captures moved out of the log. `createNodeAttachmentReader` gains `write`: it publishes `.tau/chats/<chatId>/attachments/<sha256>.<ext>` atomically (a synced temporary file linked into place, or renamed where the filesystem has no hard links), syncs the directory before the row naming the file is appended, and rejects different bytes at an existing path, which leaves that capture inline. A `createNodeChatStore` session therefore keeps only `{path, mimeType, byteLength, sha256}` per view in `events.jsonl` and restores the bytes for each model request. JPEG machine camera stills are stored too, on every host. `@taucad/host`'s ACP media and MCP screenshot attachments now go through the same writer. Existing logs are not rewritten: inline captures stay readable as they are.
