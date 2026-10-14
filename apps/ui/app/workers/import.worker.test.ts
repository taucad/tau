import { afterEach, describe, it, expect, vi } from 'vitest';
import { ShareError } from '@taucad/share/provider';
import { downloadRefusal } from '#workers/import.worker.js';
import type { ImportWorkerRequest, ImportWorkerResponse } from '#workers/import.worker.js';

const extractRepositoryImportFiles = vi.hoisted(() => vi.fn());
vi.mock('@taucad/share/repository-archive', () => ({
  extractRepositoryImportFiles,
  repositoryImportLimits: { maxArchiveBytes: 256 * 1024 * 1024 },
}));

/* The worker module listens on its global scope; jsdom's window stands in for it. */
await import('#workers/import.worker.js');

const startDownload = async (
  response: Response,
  root?: string,
): Promise<{ message: ImportWorkerResponse; options: unknown }> => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const posted = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined);
  const request: ImportWorkerRequest = {
    type: 'startDownload',
    url: 'https://api.tau.test/v1/repositories/archive',
    ...(root === undefined ? {} : { root }),
  };
  globalThis.dispatchEvent(new MessageEvent('message', { data: request }));
  await vi.waitFor(() => {
    const last = posted.mock.calls.at(-1)?.[0] as ImportWorkerResponse | undefined;
    expect(last?.type === 'error' || last?.type === 'extractComplete').toBe(true);
  });
  const [message, options] = posted.mock.calls.at(-1)! as unknown as [ImportWorkerResponse, unknown];
  return { message, options };
};

describe('import worker download failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report a 413 from the archive route as too large', async () => {
    const { message } = await startDownload(
      new Response('The repository response exceeds the portable-share limit.', {
        status: 413,
        statusText: 'Payload Too Large',
      }),
    );

    expect(message).toStrictEqual({
      type: 'error',
      message: 'The repository download is larger than the 256 MB import limit.',
      phase: 'download',
      reason: 'tooLarge',
    });
  });

  it('should report an announced length over the limit as too large', async () => {
    const { message } = await startDownload(
      new Response('zip', { status: 200, headers: { 'content-length': String(256 * 1024 * 1024 + 1) } }),
    );

    expect(message).toMatchObject({ type: 'error', reason: 'tooLarge' });
  });

  it('should report a streamed archive past the limit as too large', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
        if (sent === 257) {
          controller.close();
        }
      },
    });

    const { message } = await startDownload(new Response(body, { status: 200 }));

    expect(message).toMatchObject({ type: 'error', reason: 'tooLarge' });
    expect(extractRepositoryImportFiles).not.toHaveBeenCalled();
  });

  it('should import a download larger than a portable share from the requested folder', async () => {
    const content = new Uint8Array([7, 8, 9]);
    extractRepositoryImportFiles.mockResolvedValueOnce([{ path: 'gear/main.kcl', content }]);

    const { message, options } = await startDownload(
      new Response(new Uint8Array(9 * 1024 * 1024), {
        status: 200,
        headers: { 'content-length': String(9 * 1024 * 1024) },
      }),
      'public/kcl-samples',
    );

    expect(extractRepositoryImportFiles).toHaveBeenCalledWith(expect.any(Uint8Array), { root: 'public/kcl-samples' });
    expect(message).toStrictEqual({
      type: 'extractComplete',
      filePaths: ['gear/main.kcl'],
      files: [{ path: 'gear/main.kcl', content }],
    });
    /* Transferred, not cloned: the main thread takes the buffers the worker extracted. */
    expect(options).toStrictEqual({ transfer: [content.buffer] });
  });

  it('should report a repository over the extracted-file limits as too large', async () => {
    extractRepositoryImportFiles.mockRejectedValueOnce(
      new ShareError('SHARE_ARTIFACT_LIMIT', 'The repository project contains too many files.'),
    );

    const { message } = await startDownload(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    expect(message).toStrictEqual({
      type: 'error',
      message: 'The repository project contains too many files.',
      phase: 'download',
      reason: 'tooLarge',
    });
  });

  it("should leave other download failures without a reason, in the server's words", async () => {
    const { message } = await startDownload(
      new Response('The repository provider could not be reached.', { status: 502, statusText: 'Bad Gateway' }),
    );

    expect(message).toStrictEqual({
      type: 'error',
      message: 'The repository provider could not be reached.',
      phase: 'download',
    });
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

describe('downloadRefusal', () => {
  it.each([
    [
      'an API refusal',
      new Response(JSON.stringify({ error: 'Too many GitHub imports.', code: 'REPOSITORY_RATE_LIMITED' }), {
        status: 429,
      }),
      'Too many GitHub imports.',
    ],
    [
      "the archive gateway's sentence",
      new Response('The repository archive could not be fetched.', { status: 404 }),
      'The repository archive could not be fetched.',
    ],
    ['an empty body', new Response('', { status: 502, statusText: 'Bad Gateway' }), 'Download failed: 502 Bad Gateway'],
  ])('should say why for %s', async (_case, response, sentence) => {
    await expect(downloadRefusal(response)).resolves.toBe(sentence);
  });
});
