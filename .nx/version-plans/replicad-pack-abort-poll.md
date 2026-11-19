---
replicad: patch
---

An edit that supersedes a Replicad render while its GLB is being packed now starts its build after at most one more part, instead of after the whole pack. Packing polls the operation's abort word before each part and before writing, as OpenCascade calls already do; a render that nothing supersedes packs the same bytes.
