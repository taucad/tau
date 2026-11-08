---
revisions: patch
---

A capture that walks the checkout takes, for the files it read, only the blob ids a committed import's record holds (`facts` with `measure: false, recorded: 'import'`, for bytes of the size it listed), each confirmed by a stat at the recorded size and mtime, so the first revision of an import is built from the ids its read-back recorded (W7.3, charter D12, I2), and a same-size change the index has not observed yet is hashed, never given the recorded id. A file with no such id is hashed as before, as is one placed within the racy window (2 s) of the record: on a root that writes an import in place, most files of a fresh import are hashed once more by its first capture.
