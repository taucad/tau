---
filesystem: patch
---

The node backend no longer reports a file mode from a Windows disk. NTFS keeps no executable bit, so `NodeFsProvider` read every file there as `100644` and refused to keep `100755`; a revision applied onto Windows rejected every executable file. On Windows `NodeFsProvider` and `NodeFsProviderClient` now leave `getFileMode` and `setFileMode` out, as the `FileSystemProvider` contract allows, and a revision keeps the mode it recorded.

The answer comes from the host's disk, not the caller's platform. Node filesystem protocol version 13 adds a rootless `describe` request, `NodeFsChannel.describeHost()` asks it once per channel, and `NodeFsProviderClient` takes a `fileModes` option. `ProviderRegistry` passes the host's answer; an in-process client without the option uses its own process's platform. A host asked for a mode its disk does not keep answers `ENOTSUP`. `nodeDiskKeepsFileModes()` and the `NodeFsHostDescription` type are exported.
