---
revisions: minor
---

A permanently deleted chat syncs as its record alone. When a chat's `chat.json` carries `purgedAt`, `writeChatRef` and `replayChatSegment` record a tree that holds only that record, whatever logs or attachments the base tree carried, and remove what is left of the chat's local logs and attachments first. `projectChats` treats a purged record on either side as authoritative: it writes the record (a purge settles a conflict on any other field), writes no log segment or attachment, and removes this device's `events.jsonl`, `events/` and `attachments/`. A later fetch of a head that still carries them never writes them back.
