import { describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  summarizeFileTreeImport,
} from '#routes/w.$workspace.$project/file-tree-operation-results.js';

describe('file-tree-operation-results', () => {
  describe('summarizeFileTreeImport', () => {
    it('should report uploaded files', () => {
      const result = summarizeFileTreeImport({ uploadedFiles: 2, createdDirectories: 0, failures: [] });

      expect(result.success).toEqual({ type: 'success', message: 'Uploaded 2 files' });
      expect(result.failure).toBeUndefined();
    });

    it('should report created folders', () => {
      const result = summarizeFileTreeImport({ uploadedFiles: 0, createdDirectories: 1, failures: [] });

      expect(result.success).toEqual({ type: 'success', message: 'Created 1 folder' });
      expect(result.failure).toBeUndefined();
    });

    it('should report partial success with failure descriptions', () => {
      const result = summarizeFileTreeImport({
        uploadedFiles: 1,
        createdDirectories: 1,
        failures: ['a.js failed', 'b.js failed'],
      });

      expect(result.success).toEqual({
        type: 'partial-success',
        message: 'Imported 1 file and 1 folder',
      });
      expect(result.failure).toEqual({
        type: 'partial-success',
        message: '2 items failed to import',
        description: 'a.js failed\nb.js failed',
      });
    });

    it('should report complete failure without a success result', () => {
      const result = summarizeFileTreeImport({ uploadedFiles: 0, createdDirectories: 0, failures: ['nope'] });

      expect(result.success).toBeUndefined();
      expect(result.failure).toEqual({
        type: 'failed',
        message: '1 item failed to import',
        description: 'nope',
      });
    });
  });

  describe('copyTextToClipboard', () => {
    it('should report success after clipboard write resolves', async () => {
      const clipboard = { writeText: vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined) };

      await expect(copyTextToClipboard('public/models/honeycomb.js', clipboard)).resolves.toEqual({
        type: 'success',
        message: 'Path copied to clipboard',
      });
      expect(clipboard.writeText).toHaveBeenCalledWith('public/models/honeycomb.js');
    });

    it('should report failure when clipboard write rejects', async () => {
      const clipboard = {
        writeText: vi.fn<Clipboard['writeText']>().mockRejectedValue(new Error('permission denied')),
      };

      await expect(copyTextToClipboard('main.ts', clipboard)).resolves.toEqual({
        type: 'failed',
        message: 'Failed to copy path',
        description: 'permission denied',
      });
    });

    it('should report failure when clipboard is unavailable', async () => {
      await expect(copyTextToClipboard('main.ts', undefined)).resolves.toEqual({
        type: 'failed',
        message: 'Clipboard is unavailable.',
      });
    });
  });
});
