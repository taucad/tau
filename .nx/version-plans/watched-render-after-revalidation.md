---
runtime: patch
---

A watched document renders an edit that a request found first. When `describe`, a parameter read, a source snapshot or an export revalidates the retained files and finds one moved, the documents watching it are scheduled to render, as for a staged write. Before, the revalidation recorded the new revision, the watcher's event for the same write was deduplicated against it, and the watched document kept showing the old bytes. In the viewer this happened when the Parameters pane read the new values before the sidecar's event arrived.
