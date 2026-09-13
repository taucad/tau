// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { ImportWorkerResponse } from '#workers/import.worker.js';

describe('ImportWorkerResponse types', () => {
  it('should accept valid downloadProgress response', () => {
    const response: ImportWorkerResponse = {
      type: 'downloadProgress',
      loaded: 100,
      total: 1000,
    };
    expect(response.type).toBe('downloadProgress');
  });

  it('should accept valid extractProgress response', () => {
    const response: ImportWorkerResponse = {
      type: 'extractProgress',
      processed: 5,
      total: 10,
    };
    expect(response.type).toBe('extractProgress');
  });

  it('should accept valid extractComplete response', () => {
    const response: ImportWorkerResponse = {
      type: 'extractComplete',
      filePaths: ['src/main.ts', 'package.json'],
      files: [
        { path: 'src/main.ts', content: new Uint8Array([1]) },
        { path: 'package.json', content: new Uint8Array([2]) },
      ],
    };
    expect(response.type).toBe('extractComplete');
    expect(response.filePaths).toHaveLength(2);
    expect(response.files).toHaveLength(2);
  });

  it('should accept valid error response with phase', () => {
    const response: ImportWorkerResponse = {
      type: 'error',
      message: 'Network error',
      phase: 'download',
    };
    expect(response.type).toBe('error');
    expect(response.phase).toBe('download');
  });
});
