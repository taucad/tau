---
host: patch
runtime: patch
bambu: patch
---

A print file larger than the printer can take in 15 s now uploads: the host streams FTPS uploads in 64 KiB chunks, so basic-ftp's transfer watchdog sees the printer reading instead of aborting a healthy transfer. The Bambu provider logs why an upload failed, and a print request whose upload ended without a result now settles as `failed` with `MACHINE_UPLOAD_UNCONFIRMED` (nothing was started, so it can be sent again) instead of staying `unknown`.
