---
runtime: patch
---

Opening, updating or editing one watched document no longer restarts another document on the same client. Before, a second `open()` while the first document was arming its file watch (for example two documents opened together on a fresh client) made the first document evaluate again and its `view().rendering()` resolve `{ superseded: true }`. Now only a document's own command, a change to one of its own watched files, or client shutdown supersedes it.
