---
host: patch
---

A project's identity is initialized on Windows. The first agent start in a new project no longer fails with EPERM, because the directory sync after the identity record's hard link runs on POSIX only (Windows refuses `fsync` on a directory handle).
