---
filesystem: minor
---

A tree write can tell a root's project index every entry of the tree before any of them lands (D10).

- `ProjectIndex.expect(entries)` takes each entry with its size, its pending large object where it is a placeholder, and whether this write lands it.
- `ProjectIndex.arriving`, `expecting` and `endExpectation` read and end that expectation.
- An entry the checkout already holds is known at once; a placeholder among them becomes a pending entry.
- An arriving entry lands when a write or a move puts it at its path, and it lands pending when its bytes are its placeholder's.
- `ProjectIndexes.expect`, `landed` and `endExpectation` expose this per root, and so do the rooted view's optional `expectEntries`, `entriesLanded` and `endExpectation`. A root whose index is cold learns nothing.
