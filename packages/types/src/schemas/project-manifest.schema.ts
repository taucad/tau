import { z } from 'zod';

/** Runtime validator for normalized project-relative POSIX paths. @public */
export const projectRelativePathSchema = z
  .string()
  .max(2048)
  .refine((path) => {
    if (path.length === 0 || path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
      return false;
    }
    return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  }, 'Expected a normalized project-relative POSIX path');
