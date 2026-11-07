---
revisions: minor
---

Add `RevisionPort.listTree(id)`, an optional method that lists every file of a revision's tree by path, blob oid and mode from its tree objects alone, without reading any blob (D10). The native port also gives each blob's size, which git reads from the object header (`ls-tree -l`). After a cold open, the isomorphic port gives the size and the large object of each blob that the head listing named. Add `readEntryClosure(checkoutId)` on a project's revisions. It reads the entry closure of the checkout's head (`tau.json` and the files its main asset names) through those oids and nothing else, with a large-object entry left as its pointer and named `pending` for the fill. Nothing calls either on its own yet; the index-backed tree (pending entries in the Project Index) is their consumer.
