---
picogk: patch
---

The PicoGK browser kernel now reports which WASM build ran the author's program. Tau prefers the threaded build, and `auto` can only reach it on a cross-origin isolated page, so the console says `multi` where the page holds shared memory and `single` with the reason where it does not.
