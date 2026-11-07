---
revisions: minor
---

Connecting to Tau Cloud registers the project only when its advertisement answers `404` (D11). `authorize` no longer sends the registering `PUT /v1/projects/:id`. `validate` and the _Change backup_ probe send it when the listing is refused with `REMOTE_NOT_FOUND`, then list again. A reconnect to a project Tau Cloud already holds sends no `PUT`.
