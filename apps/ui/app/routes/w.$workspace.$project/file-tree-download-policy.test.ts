import { describe, expect, it } from 'vitest';
import {
  FileTreeDownloadError,
  createFileTreeDownloadError,
  getFileTreeDownloadErrorMessage,
  getFileTreeDownloadPolicy,
} from '#routes/w.$workspace.$project/file-tree-download-policy.js';

describe('file-tree-download-policy', () => {
  describe('getFileTreeDownloadPolicy', () => {
    it('should allow ordinary project paths', () => {
      expect(getFileTreeDownloadPolicy('public/models/honeycomb.js')).toEqual({ allowed: true });
    });

    it('should block dependency-backed read-only paths', () => {
      expect(getFileTreeDownloadPolicy('node_modules/@types/replicad/index.d.ts')).toEqual({
        allowed: false,
        code: 'dependency-read-only',
        message: 'Read-only dependency paths cannot be downloaded.',
      });
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
  });
});
