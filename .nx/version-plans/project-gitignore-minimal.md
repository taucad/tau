---
filesystem: minor
revisions: minor
---

`@taucad/revisions`' generated ignore block now carries only the lines stock Git needs to agree with `classify` (project Git policy): `/.tau/*`, the four `!` re-includes of the authored `.tau` controls, `.jj`, `/exports/`, `/thumbnail.webp` and `node_modules/`. A root-only row inside `.tau/` no longer repeats under the `/.tau/*` head, and a row marked `selfIgnored` (`.git`, which Git never walks into) takes no line, and `.jj` is spelled bare rather than `**/.jj`. An existing block is rewritten in place the next time it is generated. `IgnoreRegistryRow` gains the optional `selfIgnored`.

`@taucad/filesystem`'s `PathRegistryRow` gains the optional `selfIgnored`, set on the `.git` row. `.tau/binding.json` is now matched at the root only, like every other `.tau` row, so a nested one is no longer control plane.

Breaking: the storage root's staging directory moves from `.tau-staging` to `.tau/staging` (`opfsStagingDirectory`, `importStagingFolder`, `reservedIndexPaths` and its registry row, now root-matched). There is no migration: an import staged by an earlier build is not resumed, and bytes left under `.tau-staging` are not swept.
