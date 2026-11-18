---
revisions: patch
---

A hosted project opens in fewer round trips. Before it reads anything, the cold open asks for everything it already knows it needs: the head commits, every tree of each head listing (their ids worked out from the listing itself) and the listed blobs with their delta bases. It reads them in one wave of Range reads of at most 1 MiB each, up to 32 MiB, and drops each object's bytes once it has been read. The tree walk and the blob batches then read from those bytes instead of waiting on a request per level. The open still reads only those objects and their bases, still checks each object against its id, and keeps to the same 32-read pool per pack. A read that fails fails only what waits on it, with its own error, and a listing whose trees cannot be worked out is read level by level as before.
