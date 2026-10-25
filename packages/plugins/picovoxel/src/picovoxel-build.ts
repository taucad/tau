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
  version: '0.1.0',
  serial: 'eb7b254f50a2c7d37e46fb0169fd9890c1a366eeed78272c2ced10cbd1c26b01',
  multi: '8da3345c22f2d0945aef294151520da5df004ac4dd67114bf1ce07a503f0f444',
  scripts: 'e19aa9a77efb2c44cb0aa359ba7e3b64d2a022dbf98b2a4abf0126122aac9d7c',
} as const;
