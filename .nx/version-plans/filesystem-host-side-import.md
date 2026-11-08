---
filesystem: minor
---

A desktop import copies a folder or file a person chose on the host, host-side, instead of reading its bytes into the worker and writing them back. The Node fs wire protocol is now version 12. It adds `importSourceList` and `importSourceRead`, which list and preview a chosen source by an opaque grant, and `importCopy`, which copies its files into a root. `serveNodeFsProvider` takes `importSource(grant)`, and resolves every path inside the grant itself. A path that leaves the source, by `..` or through a link, is refused. A link is listed as one and never followed.

`NodeFsProvider.copyImportFiles` lands each file as a batch write does, filling the temp sibling with `copyFile` and `COPYFILE_FICLONE`. Before the rename it reads the sibling once for its git blob id, SHA-256 and content kind, and the receipt carries those facts. A source that is no longer a regular file of its listed size, or that was swapped during the copy, fails with the target untouched.

The importer gains `hostImportSource`, a source adapter over `HostImportSourcePort`. The path policy prunes as it walks, and the limits apply as for any folder. A planned entry is now either a decode `request` or a `host` locator. `ImportStagingPort.copyHost` stages host entries from the facts in their receipts, with no decode and no read-back. `NodeFsProviderClient.copyFromImportGrant`, `NodeFsImportSources` and `WorkspaceFileService.importSources()` reach the host.
