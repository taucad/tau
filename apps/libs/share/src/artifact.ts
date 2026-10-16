/* oxlint-disable no-barrel-files/no-barrel-files -- the moved portable artifact keeps its app subpath */
export {
  assertDistinctPaths,
  createShareArchive,
  decodeShareArchive,
  isSafePathSegment,
  openShareArchive,
  sealShareArchiveWithPassword,
  shareArtifactCodec,
  shareArtifactLimits,
  sharePasswordLimits,
} from '@taucad/project-core/share-artifact';
export type {
  ShareArtifactCodec,
  ShareOpenedArtifact,
  ShareOpenedFile,
  SharePlainArtifact,
  ShareProtectedArtifact,
} from '@taucad/project-core/share-artifact';
