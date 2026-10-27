# Gyroid Heat Exchanger

A small counterflow-looking block: gyroid lattice, solid caps, a port on each end offset to opposite sides. It is a printable demonstration of the form, not a sized exchanger.

PicoGK is the showcase because the solid is an `IImplicit` sampled on native OpenVDB. PicoVoxel is the same engine in WebAssembly and carries the lantern in this set; this block is the native one, where `VoxelSizeMm` can drop without the browser heap. The ports are SDF bosses (`max` of a tube and the complement of a hole), which a BRep fillet does not invent.

**Run status: unverified.** PicoGK's sealed closure is macOS arm64. This Linux cloud VM cannot `tau prepare picogk`, so there is no thumbnail. The row is `reference` so example-health does not require it.

Parameters are the `Params` properties: `VoxelSizeMm`, `LengthMm`, `WidthMm`, `HeightMm`, `CellMm`, `WallMm`, `CapMm`, `PortRadiusMm`, `BossRadiusMm`, `PortOffsetMm`, `StubMm`.
