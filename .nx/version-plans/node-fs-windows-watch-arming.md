---
filesystem: patch
---

On Windows, a `NodeFsProvider` watch is admitted only once its native watcher is listening. `@parcel/watcher` resolves `subscribe` before its backend thread starts watching, so a change made in between was never reported. The watch now writes a hidden probe file and admits once that probe is reported, or after 5 s, or at once when the probe cannot be written.
