---
host: patch
---

A session whose agent CLI was removed after discovery now fails with `CLI_NOT_FOUND` and a message naming the vanished file and what was searched, instead of `EXTERNAL_AGENT_FAILED`, and the session closes at once. `spawnAcpAdapter` throws that error rather than starting the vanished file. The package entry now exports `resolveAcpAdapterExecutable` and the `ReviewedAcpAgentProfile`, `AcpSupportedPlatform`, `AcpShellCommand` and `AcpExecutableFileSystem` types.
