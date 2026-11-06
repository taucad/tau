/**
 * The content metadata a listed file reports (charter D4, EQ15).
 *
 * @module
 */

import type { StatContentMetadata } from '@taucad/types';

/**
 * Keep exactly what a listing measured: a binary, a text file with its exact
 * line count or without one past the listing's byte cap, or nothing when the
 * kind itself was not measured. Never guesses a kind.
 *
 * @param metadata - A listed file's metadata.
 * @returns Only its content fields.
 */
export const listedFileMetadataFields = (metadata: StatContentMetadata): StatContentMetadata => {
  if (metadata.contentKind === 'binary') {
    return { contentKind: 'binary' };
  }
  if (metadata.contentKind === 'text') {
    return metadata.lineCount === undefined
      ? { contentKind: 'text' }
      : { contentKind: 'text', lineCount: metadata.lineCount };
  }
  return {};
};
