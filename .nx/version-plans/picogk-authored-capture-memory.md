---
picogk: patch
---

Collecting the STL and VDB files a model writes no longer costs about three times their size in browser memory. The browser's SHA-256 kept every byte it hashed in a growing buffer, so the copy and the two digests of a 512 MiB STL grew the 4 GiB heap by about 1.6 GiB after the model had finished. A file in the build's own output directory now moves into its receipt, every receipt is hashed once while it is made, and the digest runs in constant memory on both runtimes. A file the model writes into the project is still copied, so the project keeps it.
