---
revisions: patch
---

A hosted project's cold open spends less time on its own import once the pack bytes are in. Whether the store already holds each object is now answered for a whole batch at once, from one listing of the objects directory and one of each loose fan-out directory that is there, instead of one file lookup per object (about three per object in a cold open), and `ObjectStore.heldOf` answers it for callers that ask for many. An object that lands loose while it runs may be answered as not held, so it is imported again; one that is not there is never answered as held.

Writing a local pack's index computes each entry's CRC-32 eight bytes a step rather than one, about nine times faster over a cold open's 16 MB of entries; the index is byte for byte the one git writes for the same pack.

A whole pack entry read for a copy (a cold open's reads, a repack's) is inflated and checked against its id in one compute call, the optional `ComputeWorker.inflateObject`: the object crosses back from the worker once, already hashed, instead of crossing back and then over again to be hashed. Inflating it stops at the size the entry declares, and a declared size its body cannot inflate to is refused before anything is allocated for it. Every object is still checked against its id. The method is optional: a `ComputeWorker` without it is asked to inflate and then hash, as before, and a supervisor whose fallback lacks it serves it from that fallback's `inflate` and `sha1`, with the same refusals.

A cold open keeps the trees, commits and tags it read whole as the deflated bytes it read them as, as it already did for blobs, rather than deflate them again in its last step; the bytes they wait with still count against the one-batch bound.
