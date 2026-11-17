---
revisions: patch
---

A hosted project opens faster. The cold open reads the blobs its head listing names while it walks the trees level by level, reads the next batch of blobs while it keeps the last, and keeps each whole entry of the server's pack with the deflated bytes it was read as instead of deflating it again. Each object is still checked against its id, and at most 32 Range reads per pack run at once. Reading a whole tree reads up to 32 files at once instead of one after another, and a byte range cut from a larger read is sent to the compute worker as its own bytes, not with the whole read behind it.
