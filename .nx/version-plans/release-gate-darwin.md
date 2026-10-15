---
viewer: patch
cli: patch
---

`@taucad/viewer` now carries the release train's version and peers `@taucad/ui@^0.1.0-beta.0`, so npm installs it beside the published UI package instead of answering `ERESOLVE`. `tau mcp` waits at most four seconds for its kernels after the client closes, so it exits within five seconds even when a kernel thread is still terminating.
