---
revisions: patch
---

A capture that walks the checkout takes the blob ids the Project Index already holds for the files it read (`facts` with `measure: false`, for bytes of the size it listed), so the first revision of an import is built from the ids its read-back recorded and no file is hashed a second time (W7.3, charter D12, I2). A file the index has no id for is hashed as before.
