---
geospec-engine: minor
picogk: minor
---

The GeoSpec Node pool worker no longer reads PicoGK from a desktop resource-root variable; native kernels bind their closures from the shared payload store (`tau prepare <kernel>`).

`@taucad/picogk` no longer exports `loadPicogkKernelOptions`, the loader for desktop-prepared resource roots; the PicoGK kernel binds its closure from the payload store itself. `picogkRuntimeManifestSchema` stays for the desktop producer.
