---
revisions: minor
---

Connecting a remote no longer pushes the branch when the remote already advertises it at the local head (D11). In the browser, against a remote that answers the listing in protocol v1, that connect makes one `info/refs` request instead of two. A remote that answers in protocol v2 still lists its refs with `ls-refs`, and is spared the push's `info/refs` the same way.
