/**
 * The streaming import pipeline (charter D12): source adapters, one limits
 * policy, the path policy at traversal, decode and digest in one pass, and
 * staging as bounded changesets with a ledger that holds no bytes.
 *
 * @module
 */

export { ImportMeter, ImportRefusedError, importLimits, isImportRefusal, ratioFloorBytes } from '#importer/limits.js';
export type { ImportLimits, ImportRefusalReason } from '#importer/limits.js';
export {
  ImportPathAdmission,
  isReservedImportPath,
  normalizeImportPath,
  sharedLeadingFolders,
} from '#importer/path-policy.js';
export type { ImportPathVerdict } from '#importer/path-policy.js';
export {
  blobRangeSource,
  readZipDirectory,
  zipEntryAllowanceBytes,
  zipEntryDataOffset,
  zipLocalHeaderBytes,
} from '#importer/zip.js';
export type { RangeSource, ZipDirectory, ZipEntry } from '#importer/zip.js';
export { crc32Update } from '#importer/crc32.js';
export { crc32 } from '#importer/crc32.js';
export {
  createInlineImportDecoder,
  createInlineImportMeasurer,
  decodeImportEntry,
  importMeasureMaximumBytes,
  measureImportBytes,
  readImportEntry,
  subtleImportHash,
} from '#importer/decode.js';
export type {
  ImportDecodeOptions,
  ImportDecodeRequest,
  ImportDecodedEntry,
  ImportDecoder,
  ImportHash,
  ImportMeasuredFacts,
  ImportMeasurer,
} from '#importer/decode.js';
export {
  directoryHandleImportSource,
  fileListImportSource,
  handleListImportSource,
  planImport,
  spoolImportArchive,
  zipImportSource,
} from '#importer/sources.js';
export type {
  ImportListControl,
  ImportListedEntry,
  ImportPlan,
  ImportSource,
  ImportSourcePin,
  PlannedImportEntry,
} from '#importer/sources.js';
export {
  importFactsFreshMilliseconds,
  importFactsMaximumBytes,
  importFactsPath,
  importFactsSkewMilliseconds,
  isStagedImportEntry,
  parseImportFacts,
  verifiedImportFacts,
} from '#importer/facts.js';
export type { ImportFactsRecord, RecordedImportEntry, StagedImportEntry } from '#importer/facts.js';
export {
  discardStagedImport,
  importControlDirectory,
  stagedControlDirectory,
  importOwnerPath,
  importResidentBytes,
  importStagingDirectory,
  importStagingFolder,
  importStagingLeaseName,
  importStagingPrefix,
  importStagingStaleMilliseconds,
  importTargetAttempts,
  ownsImportTarget,
  placeStagedControl,
  readStagedImport,
  releaseStagedImport,
  stageImport,
  sweepStagedImports,
  touchStagedImport,
} from '#importer/staging.js';
export type { ImportStagingPort, ImportStagingProgress, StagedImport } from '#importer/staging.js';
