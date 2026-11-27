---
agent-host: patch
---

Chat logs and chat attachments are written on Windows. The Node chat store no longer fails a new log or a published attachment with EPERM, because the directory sync after a create or rename runs on POSIX only (Windows refuses `fsync` on a directory handle).
