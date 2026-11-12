---
agent-plugin: patch
---

The viewer page names each entry to the view's framing (`entryChanged`) with its saved pose or orientation as the pending pose, which framing applies after the entry's first frame, instead of observing the orientation as a person pose before it. A pose saved for an entry is dropped when the entry is switched to during a camera drag or within its settle window (D15).
