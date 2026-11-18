/**
 * The installed `picovoxel` package: its version, the SHA-256 of its two WebAssembly artifacts, and
 * one SHA-256 over every JavaScript file it ships (the facade and both glues).
 *
 * The digest of a shipped file is a build-time constant; `picovoxel.asset-ownership.test.ts`
 * recomputes all four from the installed package and fails when the dependency moves, so geometry
 * cached under one PicoVoxel build is never reused under another. The script digest catches a
 * facade-only change (lane semantics, defaults) that keeps the version and both binaries.
 *
 * @internal
 */
export const picovoxelBuild = {
  version: '0.3.0',
  serial: 'a821a753180853231fb8d2be3073d3668b99c9449e7c9ccde78a2623dff0c85c',
  multi: 'dc7f9fbbd7d3ec0aeca5fbaed4499f668b834a6410e55cdbcdeac70541241594',
  scripts: '1652c1f092413d6f7e7c02fc39756e46897d839f76c5e8f51a6d0fcfb0cb7f39',
} as const;
