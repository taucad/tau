---
revisions: patch
---

A second device no longer misses a push that lands while it opens. The open pull waits up to 2 s for the remote's move stream to read its tail. When the tail read settles after that wait has run out (a slow host or stream), the device now pulls once more, so a push between the open pull and the tail read is no longer in neither (D13).
