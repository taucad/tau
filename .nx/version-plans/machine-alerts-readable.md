---
runtime: major
bambu: major
---

`MachineManifest.camera` is `{ stills: boolean }`: the `stream` flag is removed, because no live-stream contract exists, and a manifest that still declares it is refused. `MachineAlertSnapshot` gains optional `severity` (`fatal`, `serious`, `warning` or `info`), `message` (one readable sentence, at most 512 characters) and `reference` (an `https:` help page on a named host, at most 2048 characters). The machine directory admits these fields within those bounds. The Bambu X1C manifest declares still capture only.
