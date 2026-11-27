---
replicad: patch
---

An edit that supersedes a Replicad render while its GLB is being packed now stops the pack at the next poll, instead of after the whole pack. Packing polls the operation's abort word before each part, before writing, and inside the writer before each node and before serializing, as OpenCascade calls already do; the writer's final interval (serializing and copying the buffers) is not covered. A render that nothing supersedes packs the same bytes.
