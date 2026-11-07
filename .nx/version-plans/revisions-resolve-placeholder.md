---
revisions: minor
---

`ProjectRevisions.resolvePlaceholder(checkoutId, path, signal)` is the authority's read-through for a pending entry. It answers a placeholder's object from the fill, from the store, or fetched by its own oid under the transport bound, and writes it nowhere. It answers `undefined` when the path is not a placeholder the attributes track. It rejects with `PendingError` when the object cannot be had.
