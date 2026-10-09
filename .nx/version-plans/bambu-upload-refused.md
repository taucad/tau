---
host: patch
bambu: patch
---

A Bambu printer that refuses to store an uploaded file now fails the send with a clear reason. `createNodeMachineRuntime` in `@taucad/host` turns a permanent (5xx) FTP reply to the store command into `MACHINE_UPLOAD_REFUSED`, keeping the printer's reply as its `cause`.

`@taucad/bambu` maps that error to a rejected transfer, `TRANSFER_REFUSED`. Its message names the FTP reply and points at the printer's microSD card, which may be full, damaged or locked. An A1 mini whose card fails answers every upload with a bare `550`, which until now was reported as an unconfirmed upload to "send again". A transfer that breaks off mid-way is still reported as unknown.
