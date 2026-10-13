---
host: patch
---

A Tau Host daemon whose relay cannot pair it now retries pairing with backoff and reports each failure as a `PAIRING_FAILED` warning, instead of ending. Previously, a failed pairing request (for example an HTTP 404 from an API without the pairing route) closed the agent channel the daemon had already reported ready, and `tau serve` stayed running with nothing listening until it finished recording the project's close revision.
