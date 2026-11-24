---
native-process-core: patch
host: patch
---

A sandbox shell provider can release the custody it still holds: `ShellProvider` gains an optional `close`, which `createSandboxShellProvider` implements. Custody keeps an open lock file per execution, such as a recovered execution waiting for `release`. A provider dropped without `close` left those files to garbage collection, which Node 26 turns into an uncaught `ERR_INVALID_STATE` (DEP0137 on Node 24). Call `close` before dropping a provider.
