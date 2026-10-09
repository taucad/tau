---
runtime: minor
host: minor
cli: minor
bambu: minor
grbl: minor
carvera: minor
---

Machines contract revision 3. `@taucad/runtime/machine` serves one machine model for every process: manifest v3 (axes, open components, processes, connection with `credential` and pinned `services`, halts, jobs, holds, stop), declared actions with effect sets and host-minted approvals (`MachineClient.approveAction`), holds with lease and bound, jobs (`checkJob`, `requestJob`, `resolveJob`, `withdrawJob`) replacing print requests, and stop as its own operation. The machine channel speaks hello 3 and provider protocol 2; print requests, `controlRun`, prepare/upload/start and provider queries are removed. Failures carry typed codes across every boundary (`withMachineCode`). `@taucad/runtime/host/node` adds async bounded `quiesce()`, `MachineHostStartInFlightError`, `streamingMachines()` and connect `purpose`. `@taucad/host` serves `defaultMachineProviders()`, narrowed agent grants, the binding ceremony with endpoint and certificate pinning, and keeps the computer awake while a program streams (`keepAwakeWhileStreaming`). `@taucad/grbl` (Sienci LongMill on Grbl 1.1h, streamed) and `@taucad/carvera` (Makera Carvera, stored) are new providers; `@taucad/bambu` moves to the v3 contract with binding configuration 2.1.0 (no `logicalId`). `tau serve --machines` serves the default providers from the host.
