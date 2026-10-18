---
geospec-engine: minor
picogk: minor
native-kernels: minor
---

The GeoSpec Node pool worker composes every native kernel whose closure the shared payload store holds sealed (`tau prepare <kernel>`), through `@taucad/native-kernels`, instead of PicoGK alone from a desktop resource-root variable, which it no longer reads. `geospec-engine`'s optional peer is now `@taucad/native-kernels` in place of `@taucad/picogk`; without it, or with nothing prepared, the portable defaults run alone.

`@taucad/picogk` no longer exports `loadPicogkKernelOptions`, the loader for desktop-prepared resource roots; hosts compose PicoGK from the payload store through `picogkNative`. `picogkRuntimeManifestSchema` stays for the desktop producer.

`@taucad/native-kernels/node` exports `defaultPayloadStore`, the store root `@taucad/host` also resolves, for hosts that do not depend on `@taucad/host`.
