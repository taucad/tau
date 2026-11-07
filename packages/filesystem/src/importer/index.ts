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
export { createInlineImportDecoder, decodeImportEntry, readImportEntry, subtleImportHash } from '#importer/decode.js';
export type {
  ImportDecodeOptions,
  ImportDecodeRequest,
  ImportDecodedEntry,
  ImportDecoder,
  ImportHash,
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
  discardStagedImport,
  importFactsPath,
  importOwnerPath,
  importResidentBytes,
  importStagingDirectory,
  importStagingFolder,
  importStagingLeaseName,
  importStagingPrefix,
  importStagingStaleMilliseconds,
  importTargetAttempts,
  ownsImportTarget,
  readStagedImport,
  releaseStagedImport,
  stageImport,
  sweepStagedImports,
  touchStagedImport,
} from '#importer/staging.js';
export type {
  ImportFactsRecord,
  ImportStagingPort,
  ImportStagingProgress,
  StagedImport,
  StagedImportEntry,
} from '#importer/staging.js';
