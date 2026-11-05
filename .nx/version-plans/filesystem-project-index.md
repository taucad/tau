---
filesystem: minor
revisions: patch
agent-host: patch
host: patch
---

`@taucad/filesystem` splits metadata from content (I3): `stat`, `readdirWithStats` and `exists` answer kind, size and mtime on every provider and never read a file, and a stat carries `contentKind`/`lineCount` only when they are already known (`StatContentMetadata`). The head mode is removed with it: `FileStatOptions`, `HeadFileStat`, `supportsHeadListing`, the `{ content: 'head' }` option and `fileStatFromFile` are gone, and `DirectoryStatRow` is no longer generic. Content facts are lazy: rooted views and composed views answer `facts(paths, { byteCap, digests })` (`ContentFacts`, `ContentFactsOptions`), measured once and cached by `(size, mtimeMs)`, and writes record them on the way in. `ProviderCapabilities.trustworthyMtime` marks a provider whose modification times may key that cache.

`TreeIndex` is replaced by the persistent Project Index (`ProjectIndex`, `IndexEntry`, `IndexVector`, `IndexMirror`, `reservedIndexPaths`). A root on a persistent provider with a trustworthy mtime keeps its snapshot in `<root>/.tau-index/` (`projectIndexDirectory`; `.tau-index` and `.tau-staging` are reserved control-plane paths), written under the root's Web Lock only when its cross-tab vector has seen everything the stored one has. A load is validated by a full head-metadata compare, as is a root after a cross-tab sequence gap or on `compareIndex()`/`compareIndexes()`; a scan merges with concurrent mutations instead of being discarded, and facts are trusted only past the 2 s racy-timestamp window (`timestampGranularityMilliseconds`). Rooted views always answer `hashFiles`, from the index where the provider has no digest call of its own. `workerTimings` counts `index.load`, `index.scan`, `index.compare` and `index.facts.bytes` in place of `listing.bytes`.

`@taucad/revisions`' capture memo applies the Project Index's racy window. `@taucad/agent-host`'s browser event log stats without the removed head option. `@taucad/host` lists MCP viewer folders through a `ProjectIndex`.
