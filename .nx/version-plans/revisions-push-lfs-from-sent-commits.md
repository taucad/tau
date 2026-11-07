---
revisions: minor
---

A push in the browser finds its large objects from the commits it sends (D11). It plans against the remote's advertisement first, then reads only the blobs its pack carries, and lists only the pointers among them in the LFS upload batch. It no longer reads every blob of every revision on each push. A remote with no history is still sent every commit, and so every old object. A push that has nothing to send makes no LFS batch call. The refusal for a remote that cannot hold large objects reads the same diff against the remote-tracking refs, still before any request.
