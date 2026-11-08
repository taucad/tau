---
revisions: patch
---

Fill a large-object placeholder by its pointer's own oid when the revision the fill reads from does not name it (D10 `filled`). An undo, a merge or a decision landing keeps the checkout's other paths as they are, and one of them can be a placeholder for an object that only a later head names. Before this change the fill dropped that placeholder and reported the checkout filled while the pointer was still on disk. `RevisionPort.fetchLargeObjects` fetches objects by pointer from the store, or else from the remote. The fill asks for every object the head's tree did not deliver, so the checkout reads `filled` only when those objects have been written. Offline, the fill reports `failed` and keeps the placeholder until a retry.
