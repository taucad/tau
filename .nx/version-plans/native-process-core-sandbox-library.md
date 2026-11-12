---
native-process-core: patch
---

Build the OS sandbox launcher, the process tree and the contained shell from the private `@taucad/sandbox` library, which this package now bundles under `dist/libs/sandbox/`. The published surface is unchanged: the root still exports `launchInNativeSandbox`, `spawnInNativeSandbox`, `nativeSandboxPolicy`, `nativeSandboxBwrapVariable` and `NativeRuntimeUnavailableError`, `./shell` re-exports the same shell seam, and `dist/shell/srt-supervisor.mjs` still exists beside the bundled supervisor the default provider starts.
