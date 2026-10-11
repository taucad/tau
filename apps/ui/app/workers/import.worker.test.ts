import { afterEach, describe, it, expect, vi } from 'vitest';
import { ShareError } from '@taucad/share/provider';
import type { ImportWorkerRequest, ImportWorkerResponse } from '#workers/import.worker.js';

const extractRepositoryArchiveFiles = vi.hoisted(() => vi.fn());
vi.mock('@taucad/share/repository-archive', () => ({ extractRepositoryArchiveFiles }));

/* The worker module listens on its global scope; jsdom's window stands in for it. */
await import('#workers/import.worker.js');

const startDownload = async (response: Response): Promise<ImportWorkerResponse> => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const posted = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined);
  const request: ImportWorkerRequest = { type: 'startDownload', url: 'https://api.tau.test/v1/repositories/archive' };
  globalThis.dispatchEvent(new MessageEvent('message', { data: request }));
  await vi.waitFor(() => {
    expect(posted).toHaveBeenCalled();
  });
  return posted.mock.calls.at(-1)![0] as ImportWorkerResponse;
};

describe('import worker download failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report a 413 from the archive route as too large', async () => {
    const message = await startDownload(
      new Response('The repository response exceeds the portable-share limit.', {
        status: 413,
        statusText: 'Payload Too Large',
      }),
    );

    expect(message).toStrictEqual({
      type: 'error',
      message: 'The repository download is larger than the 8 MB import limit.',
      phase: 'download',
      reason: 'tooLarge',
    });
  });

  it('should report an announced length over the limit as too large', async () => {
    const message = await startDownload(
      new Response('zip', { status: 200, headers: { 'content-length': String(9 * 1024 * 1024) } }),
    );

    expect(message).toMatchObject({ type: 'error', reason: 'tooLarge' });
  });

  it('should report a repository over the extracted-file limits as too large', async () => {
    extractRepositoryArchiveFiles.mockRejectedValueOnce(
      new ShareError('SHARE_ARTIFACT_LIMIT', 'The repository project contains too many files.'),
    );

    const message = await startDownload(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    expect(message).toStrictEqual({
      type: 'error',
      message: 'The repository project contains too many files.',
      phase: 'download',
      reason: 'tooLarge',
    });
  });

  it('should leave other download failures without a reason', async () => {
    const message = await startDownload(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }));

    expect(message).toStrictEqual({ type: 'error', message: 'Download failed: 502 Bad Gateway', phase: 'download' });
  });
});

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
