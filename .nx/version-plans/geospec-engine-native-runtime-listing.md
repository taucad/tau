---
geospec-engine: minor
---

The GeoSpec default runtime lists `build123d()` and `picogk()` after `assimp` whenever those packages are installed, and each native kernel binds its own sealed closure from the payload store when it initialises, refusing with `KERNEL_NOT_PREPARED` until `tau prepare <kernel>` seals it. The pool worker reads the managed preparation profile up front and installs the store's closure resolver from `@taucad/native-process-core/store`, so a malformed profile still refuses the whole runtime. `geospec-engine`'s optional peers are now `@taucad/build123d`, `@taucad/picogk` and `@taucad/native-process-core` in place of `@taucad/native-kernels`; without them the portable defaults run alone.
