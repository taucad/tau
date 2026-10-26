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
  version: '0.2.0',
  serial: '97a9dd03b125b1b1d43425e1338c48d1f8580886959562442ee8f529a89996d5',
  multi: 'ea4ec47415a684141d2219cd4b0a44c4a3e251b2a1ac148ea6b63c4da7aaca85',
  scripts: '837e863542777a68f7c051a118736cd38cc9564f04e5ac195cf1b8a3effe083c',
} as const;
