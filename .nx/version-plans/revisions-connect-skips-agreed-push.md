---
revisions: minor
---

Connecting a remote no longer pushes the branch when the remote already advertises it at the local head (D11). That connect makes one `info/refs` request instead of two.
