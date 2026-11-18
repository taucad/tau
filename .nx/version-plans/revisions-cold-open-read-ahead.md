---
revisions: patch
---

A hosted project opens in fewer round trips. Before it reads anything, the cold open asks for everything it already knows it needs: the head commits, every tree of each head listing (their ids worked out from the listing itself) and the listed blobs with their delta bases. It reads them in one wave of Range reads of at most 1 MiB each, up to a 32 MiB budget (`readAheadBytes`, 0 turns it off). The tree walk and the blob batches then read from those bytes instead of waiting on a request per level. The open still reads only those objects and their bases, still checks each object against its id, and keeps to the same 32-read pool per pack.
