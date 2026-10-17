---
geospec: minor
host: minor
---

Run on `geospec-engine` 0.2.0 and use its host-selected limits.

- `@taucad/host` constructs its native GeoSpec engine with 1 GiB of analysis memory per subject, so watertight and connected-component claims decide on meshes up to the 4 million triangles the entry admission limit admits. Admission limits stay at the entry profile. The optional `geospec-engine` peer is now `^0.2.0`.
- `geospec` accepts the `geospec-host-config-v1-…` configuration profile an engine reports when a host selects its limits.
- `geospec` recognizes the retained-subject refusal by its structured capacity instead of its message, so eviction and re-admission keep working on 0.2.0.
- A minimum-distance query refused by an analysis or admission limit now returns `analysis-limit` or `resource-limit` instead of an `engine-error` interruption.
