---
revisions: patch
---

A browser push now reports `rejected` with `leaseLost` whenever the server's compare-and-set refuses a ref another writer moved after the push read its advertisement, including an advertisement the push read itself rather than one kept from an earlier push of the session. The refusal is read from what git said about that ref (`is at <oid> but expected <oid>`, `reference already exists`, a bare `unable to resolve reference '<ref>'`, `reference is missing but expected <oid>`, `reference does not exist`, `incorrect old value provided`). A ref whose lock another process holds on the server, or that the server cannot read (`reference broken`, a permission or I/O error), is no longer reported as `leaseLost`: it is refused with git's own words (`failed to update ref`), since nothing moved it.
