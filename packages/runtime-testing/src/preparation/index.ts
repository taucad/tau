/* oxlint-disable no-barrel-files/no-barrel-files -- public preparation subpath */
// `@taucad/runtime-testing/preparation`: the Node-only harness for native dependency preparation tests (charter D27).
export { storedZip, tarGz, utf8, wheel } from '#preparation/archives.js';
export type { TarMember } from '#preparation/archives.js';
export { createFakeRegistry } from '#preparation/fake-registry.js';
export type { FakeRegistry, FakeRoute } from '#preparation/fake-registry.js';
export { forbidGlobalFetch, installFetchTripwire } from '#preparation/fetch-tripwire.js';
export { createFixtureClosure, fixtureTargets, sha256Hex, writeSeedDirectory } from '#preparation/fixture-closure.js';
export type {
  FixtureClosure,
  FixtureClosureInput,
  FixtureDependencyFile,
  FixtureDependencyFileInput,
} from '#preparation/fixture-closure.js';
export {
  appendGoldenSummary,
  compareWithGolden,
  goldenSummaryRow,
  readGoldenReceipts,
} from '#preparation/golden-receipts.js';
export type { GoldenComparison, GoldenReceipt, GoldenReceipts } from '#preparation/golden-receipts.js';
export { startDependencyMirror } from '#preparation/dependency-mirror.js';
export type { MirrorOverride, MirrorRequest, DependencyMirror } from '#preparation/dependency-mirror.js';
