---
geospec: minor
geospec-engine: minor
---

Move the worker pool into `geospec/runner/worker`: `createGeoSpecPoolRunner`, `startGeoSpecPoolWorkerHost` and their option and timing types are exported there, and the pool runs each file through the same `executeGeoSpecFile` step as the serial runner. Remove the forensic timing channel and the matcher wall backstop: the `forensic` and `matcherWallBackstop` run options, config fields and pool messages, the `forensic` runner event and `GeoSpecForensicEvent`, and the `geospec run --forensic` and `--matcher-wall-backstop` flags. A config file that still sets either field is refused as an unsupported field.
