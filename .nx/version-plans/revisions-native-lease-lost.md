---
revisions: patch
---

The native-git leg reads a ref another writer moved inside the server's receive as `leaseLost`, as the browser leg does: both run git's per-ref status and `remote:` sideband through one `refMoved` check, so an atomic push's other refs fall with a moved one, and a held lock or a broken ref keeps git's own words.
