# @taucad/revisions

Host-neutral revision port with a native-Git and an `isomorphic-git` implementation

A revision is an immutable, content-addressed snapshot of one workspace tree with
its parents and provenance. Its identity **is** its Git commit id, so the same
tree and the same headers name the same revision on every host.

`RevisionPort` is the one seam every host implements. Two ports ship here:

| Port                              | Engine                                       | Where it runs                   |
| --------------------------------- | -------------------------------------------- | ------------------------------- |
| `createNativeGitRevisionPort`     | the `git` binary: objects, refs, worktrees   | Node hosts with `git` on `PATH` |
| `createIsomorphicGitRevisionPort` | `isomorphic-git` over a `FileSystemProvider` | the page, the worker, anywhere  |

`./node` also still exports `createNativeGitAdapter`, the workspace-shaped
adapter this package started from: the port above is built over the same
primitives (`fast-import`, `update-ref`, `worktree`) and imports its transport
parsers, and its 655-line integration suite is the only coverage those
primitives have. It is a third export, not a third port — nothing outside this
package constructs it — and it leaves when W3c moves the last native consumer
onto the port.

Both ports write a real Git repository, and both write the _commit_ object with this
package's own encoder: every revision carries a `change-id` from creation and a
conflicted one carries `jj:conflict-labels` and `jj:trees` in Jujutsu's exact
header order, none of which `git commit-tree` or `isomorphic-git`'s
`CommitObject` can express. One encoder over two object stores is why the same
scripted edits name the same tree — and the same revision — on both legs.
Every port preserves the `Tau-Metadata` provenance trailer, and `objectFormat`
travels on every receipt; no caller assumes a 40-character id.

A merge is the caller's: `mergeRevisionTrees` from `@taucad/filesystem/revisions`
produces the tree, and the terms of an unresolved one are recorded as a value on
the revision, so a conflict lives in the graph rather than failing an operation.

The generated ignore file is written **before** `init`, because the engine
tracks whatever the ignore file does not exclude. Its content is derived from
`@taucad/filesystem/path-registry`: every row whose bytes are not versioned.

## Tests

The port conformance table runs the `isomorphic-git` row unconditionally and the
`native-git` row wherever `git` is on `PATH`, and compares the two:

```bash
pnpm nx test revisions --watch=false
```

The native Git adapter's integration suite is explicit:

```bash
TAU_NATIVE_GIT_INTEGRATION=1 pnpm nx test revisions --watch=false --skip-nx-cache
```
