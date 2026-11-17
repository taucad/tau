---
runtime: patch
---

Machine records are written on Windows. The Node machine store and machine event log no longer fail with EPERM when they create a directory, record or log, because the directory sync after a create or rename runs on POSIX only (Windows refuses `fsync` on a directory handle).
