# @taucad/revisions

Host-neutral revision port with jj, native-Git and browser adapters for Tau

A revision is an immutable, content-addressed snapshot of one workspace tree with
its parents and provenance. Its identity **is** its Git commit id, so the same
tree and the same headers name the same revision on every host.

`RevisionPort` is the one seam every host implements. Three adapters ship here:

| Adapter   | Engine                                             | Where it runs                              |
| --------- | -------------------------------------------------- | ------------------------------------------ |
| `jj`      | the pinned Jujutsu CLI, spawned                    | any host with the checksum-verified binary |
| `git`     | the native Git object/ref/worktree adapter         | Node hosts with `git` on `PATH`            |
| `browser` | the Git object encoder over a `FileSystemProvider` | the page; not a Git engine                 |

Every revision carries a `change-id` from creation. Conflicted revisions carry
`jj:conflict-labels` and `jj:trees` in Jujutsu's exact header order, and every
adapter preserves the `Tau-Metadata` provenance trailer. `objectFormat` travels
on every receipt; no caller assumes a 40-character id.

The generated ignore file and the per-project Jujutsu configuration are written
**before** `init`, because the engine tracks whatever the ignore file does not
exclude and drops authored files above its default size limit.

## Tests

The port conformance table runs against the `browser` adapter unconditionally and
against the `jj` adapter whenever the pinned binary resolves:

```bash
TAU_JJ_EXECUTABLE=/abs/path/to/jj pnpm nx test revisions --watch=false
```

The native Git suite is explicit:

```bash
TAU_NATIVE_GIT_INTEGRATION=1 pnpm nx test revisions --watch=false --skip-nx-cache
```
