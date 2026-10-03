---
filesystem: minor
host: minor
---

`NodeFsProviderClient` streams reads: `readFileStream` pulls bounded `readFileRange` chunks from the authority, so a project host's filesystem exposes the same streaming read the local provider does. `HostToolFileSystem` now requires `readFileStream` and `writeFileChecked`, and a project host refuses a checkout filesystem without them when an attempt's tools are opened, instead of the print tools reporting "Machine settings authority is unavailable." for every print request.
