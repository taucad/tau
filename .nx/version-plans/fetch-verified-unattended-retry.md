---
archive-core: patch
python-kernel-core: patch
---

`fetchVerified` takes a `retry` policy, and `unattendedFetchRetry` is the schedule for a download nobody is waiting on: eight attempts with waits of 2, 4, 8, 16, 30, 30 and 30 s, so a failed name resolution (`ENOTFOUND`, `EAI_AGAIN`) or an origin outage of about two minutes costs retries rather than the run, and a longer one still fails. A wait between attempts now ends as soon as the signal aborts. The default schedule is unchanged. `fetchVerifiedFile` from `@taucad/archive-core/node` keeps a pinned download in a file: a file that already matches the pin is reused, and new bytes are written to a temporary file and renamed into place only after they matched. `tau-python-kernel seed`, `generate` and `check` download on the unattended schedule.
