---
agent-plugin: patch
---

The launcher keeps at most 128 bytes of what an installed `tau` prints for `--version`: a `tau` that prints more is passed over, and none of its output reaches `TAU_LAUNCH`, where an oversized value stopped the CLI from starting. A `tau` that prints past that limit or does not answer within 2 seconds is killed with `SIGKILL`, so one that ignores `SIGTERM` no longer hangs the launcher. A CLI that `spawn` refuses to start now ends in one `tau: cannot start …` line and exit 1 rather than a stack trace. Each installed `tau` is probed once when `PATH` names its folder twice, as with a trailing slash; the npm cache check no longer reports a writable cache as not writable when its probe file cannot be removed afterwards; and exit 4 says whether npm was not found on `PATH` or did not run, before the install hint.
