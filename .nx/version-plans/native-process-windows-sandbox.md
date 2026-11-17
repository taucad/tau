---
native-process-core: minor
---

Native workers and sandboxed commands can run on Windows, contained by the Windows sandbox helper (`tau-windows-sandbox.exe launch`). Each launch gets a per-launch AppContainer package SID, read access to the runtime root and the workspace mirror, write access to the artifact root only, and no network. The helper hashes the executable again through a handle it holds until the process exists, so a launch must carry the digest the host verified: `NativeSandboxLaunch` gains `executableSha256`, which is required on Windows. Ending a Windows worker sends the helper's `terminate`, so the helper restores folder permissions before reporting the exit. A process-tree kill of the helper would leave them for recovery instead.

A host enables the sandbox with `configureWindowsNativeSandbox({ helperPath, journalDirectory, installed, setup })`. Until it does, a Windows launch is `NATIVE_RUNTIME_UNAVAILABLE` ("the Windows sandbox is not enabled in this Tau build"). Before its first launch, the host runs the one-time setup when the person allows it, then restores every journal an earlier crash left behind (`recoverWindowsNativeJournals`).

`configureWindowsNativeSandbox` and `nativeSandboxRefusal` are exported from the package root. Pass `nativeSandboxRefusal` as a preparation host's `nativeContainment`, and a Windows host prepares a native kernel only once it has configured the helper. Sandboxed launches run side by side, so a Build123d worker and the Terminal can run at the same time. The executable is passed to the helper as its long, resolved path.

On Windows a native worker's `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` point at its artifact folder, as `HOME` does elsewhere. Python's `Path.home()` reads `USERPROFILE`, and Build123d's ezdxf import failed without it.
