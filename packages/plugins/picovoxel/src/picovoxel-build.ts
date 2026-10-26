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
  version: '0.2.1',
  serial: 'c5d62d6a29a07b6768e3e76a63819442506f9666e25370972302ef8ae63d7699',
  multi: '01403df2de463baec14b74032c00660047fc6e70e40a90342ec46421d8957881',
  scripts: '1bd0cf4f297884c6a3f93e124cfc0458a3033ca4a7e07c729ddfe3140644c3ba',
} as const;
