---
revisions: minor
---

A downloaded large object streams from the network into its `.partial` where the store offers `writeFileStream`, so no copy is held while it transfers; the partial is then read back once and hashed once, and those verified bytes are what the tree and the fill receive (I2). `LfsDownloadManyInput` gains `streamed`, a sink that takes each object as a stream (called again for a broken transfer's retry), beside `received`, now optional; the compute worker gains `sha256Kept`, which returns the bytes it hashed; and `gitFilesOf` passes a provider's `writeFileStream` through only where the provider declares `streamsWrites`, so a store whose fallback would gather the stream takes the whole transfer once instead. The transfer's stall bound now counts only time spent waiting on the network, so a store slower than the bound to write a chunk no longer aborts and retries the download.
