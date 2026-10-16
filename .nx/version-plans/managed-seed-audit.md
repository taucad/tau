---
cli: minor
build123d: minor
picogk: minor
---

`tau prepare` gains the managed seed and audit verbs. `--bundle <dir>` prepares a kernel and exports its closure as a seed directory (`blobs/sha256/<hex>`, the plugin manifest, an audit unit per closure and a `tau-seed.json` index); `--verify-seed <dir>` checks every blob, pin, closure identity and audit unit of a seed before it is imported; `--seed <dir>` prepares from a seed with no request; `--audit` re-verifies every prepared closure offline against its receipt, its CycloneDX SBOM and its licence notices, and exits 3 on any gap. `tau ui verify <dir>` re-hashes a deployed Tau UI against the `tau-asset-receipt.json` its build writes. `tau serve --ui` hands the served page the daemon's `TAU_ACQUISITION`. `@taucad/picogk` ships `tau-plugin.cdx.json`, the SBOM of its closure with a purl, the pinned hash and the distribution URLs per payload, and `@taucad/build123d` ships the licence notices its two OCP wheels lack.
