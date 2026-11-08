---
revisions: minor
---

A push in the browser finds its large objects from the commits it sends (D11). It plans against the remote's advertisement first, then reads only the blobs its pack carries, and lists only the pointers among them in the LFS upload batch. It no longer reads every blob of every revision on each push. A remote with no history is still sent every commit, and so every old object. A push that has nothing to send makes no LFS batch call. Only blobs stored in under 2 KiB are inflated to look for a pointer, sixteen at a time. The refusal for a remote that cannot hold large objects (`LFS_REMOTE_UNSUPPORTED`) now reads the pointers among the blobs the push would send, after the advertisement and before any batch call or `receive-pack`. Remote-tracking refs left by an earlier remote of the same name no longer hide large objects from it.
