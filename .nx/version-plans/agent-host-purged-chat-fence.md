---
agent-host: minor
---

A permanently deleted chat's writers are fenced. `createNodeChatStore` and `createBrowserChatStore` (OPFS and provider) read the chat's `chat.json`, and when it carries `purgedAt` they refuse with `LOG_FENCED` to open the chat's log, to append to a log that was already open, and to write an attachment. A run that was live when its chat was purged stops at its next row, and nothing the purge removed is written back.
