/**
 * The streaming import pipeline (charter D12): source adapters, one limits
 * policy, the path policy at traversal, decode and digest in one pass, and
 * staging as bounded changesets with a ledger that holds no bytes.
 *
 * @module
 */

export { ImportMeter, ImportRefusedError, importLimits, isImportRefusal, ratioFloorBytes } from '#importer/limits.js';
export type { ImportLimits, ImportRefusalReason } from '#importer/limits.js';
export { ImportPathAdmission, normalizeImportPath, sharedLeadingFolders } from '#importer/path-policy.js';
export type { ImportPathVerdict } from '#importer/path-policy.js';
export { blobRangeSource, readZipDirectory, zipEntryDataOffset, zipLocalHeaderBytes } from '#importer/zip.js';
export type { RangeSource, ZipEntry } from '#importer/zip.js';
export { crc32, createInlineImportDecoder, decodeImportEntry, subtleImportHash } from '#importer/decode.js';
export type { ImportDecodeRequest, ImportDecodedEntry, ImportDecoder, ImportHash } from '#importer/decode.js';
export {
  directoryHandleImportSource,
  fileListImportSource,
  planImport,
  spoolImportArchive,
  zipImportSource,
} from '#importer/sources.js';
export type {
  ImportListedEntry,
  ImportPlan,
  ImportSource,
  ImportSourcePin,
  PlannedImportEntry,
} from '#importer/sources.js';
export {
  discardStagedImport,
  importStagingDirectory,
  importStagingFolder,
  importStagingPrefix,
  readStagedImport,
  stageImport,
} from '#importer/staging.js';
export type { ImportStagingPort, ImportStagingProgress, StagedImport, StagedImportEntry } from '#importer/staging.js';
