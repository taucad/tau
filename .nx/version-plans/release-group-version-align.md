---
__default__: patch
---

Put every package in the release group on one version. Packages first published at `0.0.1` or `0.1.0-beta.0` now share the train's `0.1.0-beta.1` baseline, and the peer ranges on `@taucad/camera`, `@taucad/spatial` and `@taucad/geospec-engine-native` carry the prerelease lower bound `^0.1.0-beta.0`, so each prerelease of those packages satisfies its dependants.
