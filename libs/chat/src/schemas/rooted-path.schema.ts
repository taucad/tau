import { z } from 'zod';
import { assertRootedPath } from '@taucad/utils/path';

const isCanonicalRootedPath = (value: string): boolean => {
  try {
    assertRootedPath(value);
    return true;
  } catch {
    return false;
  }
};

/** Canonical path relative to an already-selected filesystem capability. @public */
export const rootedPathSchema = z
  .string()
  .refine(isCanonicalRootedPath, 'Path must be canonical and relative to the project root.');

/** Canonical non-root file path relative to an already-selected filesystem capability. @public */
export const rootedFilePathSchema = rootedPathSchema.min(1, 'Path must name a file.');
