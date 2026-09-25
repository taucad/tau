---
revisions: minor
---

Fix three checkout defects. A conflicted turn retires its lease, so a later save reaches the mint. A head that moves during a mint no longer aborts it: the checkout re-reads once the mint settles. A registry announcement now carries `headsCached: true` when it republishes cached heads, and the root keeps its own head for such an announcement; a compare-and-swap against a branch the checkout has left answers `conflicted`.
