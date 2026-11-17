---
native-process-core: minor
---

Native workers and sandboxed commands can run on Windows, contained by the Windows sandbox helper (`tau-windows-sandbox.exe launch`). Each launch gets a per-launch AppContainer package SID, read access to the runtime root and the workspace mirror, write access to the artifact root only, and no network. The helper hashes the executable again through a handle it holds until the process exists, so a launch must carry the digest the host verified: `NativeSandboxLaunch` gains `executableSha256`, which is required on Windows. Ending a Windows worker sends the helper's `terminate`, so the helper restores folder permissions before reporting the exit. A process-tree kill of the helper would leave them for recovery instead.

A host enables the sandbox with `configureWindowsNativeSandbox({ helperPath, journalDirectory, installed, setup })`. Until it does, a Windows launch is `NATIVE_RUNTIME_UNAVAILABLE` ("the Windows sandbox is not enabled in this Tau build"). Before its first launch, the host runs the one-time setup when the person allows it, then restores every journal an earlier crash left behind (`recoverWindowsNativeJournals`).
