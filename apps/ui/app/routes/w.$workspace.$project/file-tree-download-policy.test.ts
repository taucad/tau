import { describe, expect, it } from 'vitest';
import { archiveTooLargeCode } from '@taucad/filesystem/content-ops';
import {
  FileTreeDownloadError,
  createFileTreeDownloadError,
  getFileTreeDownloadErrorMessage,
  getFileTreeDownloadPolicy,
} from '#routes/w.$workspace.$project/file-tree-download-policy.js';

describe('file-tree-download-policy', () => {
  describe('getFileTreeDownloadPolicy', () => {
    it('should allow ordinary project paths', () => {
      expect(getFileTreeDownloadPolicy({ source: 'project', versioned: true, agentAccess: 'read-write' })).toEqual({
        allowed: true,
      });
    });

    it('should allow a row no view stamped', () => {
      expect(getFileTreeDownloadPolicy(undefined)).toEqual({ allowed: true });
    });

    it('should block dependency-backed read-only paths', () => {
      expect(getFileTreeDownloadPolicy({ source: 'dependencies', versioned: false, agentAccess: 'read-only' })).toEqual(
        {
          allowed: false,
          code: 'dependency-read-only',
          message: 'Read-only dependency paths cannot be downloaded.',
        },
      );
    });
  });

  describe('download errors', () => {
    it('should preserve typed download error metadata', () => {
      const cause = new Error('zip exploded');
      const error = createFileTreeDownloadError({
        code: 'zip-generation-failed',
        path: 'public/models',
        cause,
      });

      expect(error).toBeInstanceOf(FileTreeDownloadError);
      expect(error).toMatchObject({
        name: 'FileTreeDownloadError',
        code: 'zip-generation-failed',
        path: 'public/models',
        message: "Failed to create ZIP for 'public/models': zip exploded",
      });
      expect(error.cause).toBe(cause);
    });

    it('should return typed error messages for user-facing toasts', () => {
      const error = createFileTreeDownloadError({
        code: 'permission-read-only',
        path: 'node_modules',
      });

      expect(getFileTreeDownloadErrorMessage(error)).toBe('Read-only dependency paths cannot be downloaded.');
    });

    /* The archive's refusal crosses the bridge wire as a bare `Error` with a
     * `code`, and its message is the byte count in decimal; the user is told
     * the ceiling in their own units instead. */
    it('should tell the user the archive ceiling when the archive refuses the size', () => {
      const wire = Object.assign(new Error("Archive of '' exceeds its 268435456-byte ceiling."), {
        code: archiveTooLargeCode,
      });

      expect(getFileTreeDownloadErrorMessage(wire)).toBe(
        'This folder is larger than the 256.0 MB a ZIP download can hold. Download a smaller folder instead.',
      );
      expect(
        getFileTreeDownloadErrorMessage(
          createFileTreeDownloadError({ code: 'zip-generation-failed', path: 'public', cause: wire }),
        ),
      ).toBe('This folder is larger than the 256.0 MB a ZIP download can hold. Download a smaller folder instead.');
    });
  });
});
