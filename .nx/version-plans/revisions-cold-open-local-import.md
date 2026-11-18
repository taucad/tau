---
revisions: patch
---

A hosted project's cold open spends less time on its own import once the pack bytes are in. Whether the store already holds each object is now answered for a whole batch at once, from one listing of the objects directory and one of each loose fan-out directory that is there, instead of one file lookup per object (about three per object in a cold open), and `ObjectStore.heldOf` answers it for callers that ask for many. An object that lands loose while it runs may be answered as not held, so it is imported again; one that is not there is never answered as held.

Writing a local pack's index computes each entry's CRC-32 eight bytes a step rather than one, about nine times faster over a cold open's 16 MB of entries; the index is byte for byte the one git writes for the same pack.
