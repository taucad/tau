---
geospec-engine: patch
---

Give the GeoSpec package build a bounded 4 GiB JavaScript heap so declaration generation can finish on native CI runners. Keep the heap option local to the build process and preserve runtime worker limits.
