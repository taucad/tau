import { describe, expect, it, vi } from 'vitest';
import { createHttpHatchetJobProjection } from '#http-job-projection.js';

describe('createHttpHatchetJobProjection', () => {
  it('authenticates and routes attempt identity without putting credentials in the payload', async () => {
    let capturedUrl: URL | RequestInfo | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation = vi.fn<typeof fetch>(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ accepted: true }));
    });
    const projection = createHttpHatchetJobProjection({
      apiUrl: 'https://api.example.test',
      credential: 'secret',
      fetch: fetchImplementation,
    });

    await expect(
      projection.progress({
        jobId: 'job/1',
        attemptId: 'attempt-2',
        attempt: 2,
        runnerId: 'runner-1',
        progress: { phase: 'solve', completed: 1, total: 2, message: 'running' },
      }),
    ).resolves.toEqual({ accepted: true });

    expect(capturedUrl).toBeInstanceOf(URL);
    if (!(capturedUrl instanceof URL)) {
      expect.fail('Expected URL input');
    }
    expect(capturedUrl.href).toBe('https://api.example.test/v1/jobs/job%2F1/attempts/progress');
    expect(capturedInit?.headers).toEqual({ authorization: 'Bearer secret', 'content-type': 'application/json' });
    expect(capturedInit?.body).toBeTypeOf('string');
    if (typeof capturedInit?.body !== 'string') {
      expect.fail('Expected string request body');
    }
    expect(capturedInit.body).not.toContain('secret');
    expect(capturedInit.body).not.toContain('runner-1');
  });
});
