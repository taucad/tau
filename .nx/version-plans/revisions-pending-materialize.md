---
revisions: minor
---

Reading a checkout file through its large-object placeholder (D9). `readContent(checkoutId, path, { wait })` on the project's revisions resolves a placeholder to its object when the object is on this device, either in the store or landed and not yet written. Otherwise it answers a typed `pending` outcome with the object's id, size and a reason (`filling`, `offline` or `not-fetched`), never the pointer's text or empty bytes. It can wait a bounded number of milliseconds for a running fill. `materialize(checkoutId, paths)` makes those paths physical files. It promotes them in the fill, starts a fill on a checkout with none running, and rejects with a `PENDING` error for a path whose object could not be fetched. `RevisionPort.readLargeObject` is a new optional, local-only read of one object.
