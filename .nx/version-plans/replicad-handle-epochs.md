---
replicad: minor
runtime-testing: minor
---

Replicad builds with `@taulabs/replicad` 1.2.0-beta.1, which builds each operation once and gives every OpenCASCADE value one owner: wrappers adopt what they are given and `cast()` consumes its input. The kernel now implements `releaseHandle`: when the runtime drops a build, the shapes it delivered are deleted with the next build, unless that build delivers them again, instead of whenever the garbage collector runs, so the heap stays flat over a long drag. Shapes a model builds at module scope are kept across parameter-only rebuilds. The live operation tier keeps at most `computeReuseBytes` estimated bytes across documents (256 MiB by default) besides its entry cap, and evicts its least recently used entries under that pressure. Interface resolution and STEP export no longer leave labels, faces or finders behind. `@taucad/runtime-testing` adds `installHandleLedger` and `summarizeLeaks`, a ledger of live embind handles for leak tests.
