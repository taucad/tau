---
archive-core: minor
bundler-core: minor
runtime: minor
---

Add `@taucad/archive-core`, the verified download and archive reader for native kernel payloads, and the `tau-plugin.json` v1 contract with closure receipts.

- `@taucad/archive-core` exports `fetchVerified`, which downloads bytes and returns them only once they match their SRI pin. It retries transport errors, 429 and 5xx three times, follows redirects only to `https:` targets a policy admits, and fails an attempt after 60 s without a response or body chunk, so a slow download that keeps arriving is not cut off. It also exports bounded `readTarEntries`, `readZipEntries`, `readWheel` and `gunzip`, the integrity helpers and `findCaseCollisions`; every reader takes explicit size and entry limits and refuses unsafe paths and links with an `ArchiveError`.
- `@taucad/bundler-core` reads package tarballs through `@taucad/archive-core`.
- `@taucad/runtime` carries the `tau-plugin.json` v1 deployment contract, its parser and closure receipt integrity internally; the native preparation host consumes them, and no public export changes yet.
