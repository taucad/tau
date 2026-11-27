---
agent-host: patch
---

The Node chat-log writer's marker (`events.jsonl.lock`) records the machine's boot on a third line: Linux's `boot_id`, or elsewhere the boot's start in epoch seconds derived from the uptime. A writer that finds a marker recorded under another boot takes it over, so a pid reused after a reboot no longer keeps a chat locked (`WRITER_LOCKED`) until that unrelated process exits. A marker with no boot line, from an older build, is still judged by its pid alone, and a browser open still reads the new marker as a Node writer's.
