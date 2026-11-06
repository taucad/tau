---
revisions: minor
---

Add crash-safe adoption of authored large files (D9). `adoptLargeObjects(checkoutId)` on a project's revisions stores every large file that the checkout's attributes track and that it holds whole. The object goes to a `.partial` and is renamed into place; it is then read back and hashed, and only after that is the file replaced by its pointer, as one changeset whose precondition is the file as captured. A kill at any step leaves the full file, or the pointer with the verified object, once an open has swept its temporary siblings. `RevisionPort.storeLargeObject` is a new optional method. Nothing calls the adoption on its own yet.
