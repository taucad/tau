// @vitest-environment node
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { loader } from '#routes/health.live.js';
import { heapThresholdBytes } from '@taucad/ui-core/constants/health.constants';

const callLoader = async () => {
  // The liveness loader doesn't read request/params/context — pass a stub.
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal stub for loader signature
  const args = {} as Parameters<typeof loader>[0];
  return (await loader(args)) as Response;
};

describe('GET /health/live', () => {
  it('should return 200 + status:ok when heap is under threshold', async () => {
    const original = process.memoryUsage;
    const spy = vi.fn(() => ({
      rss: 100,
      heapTotal: 200,
      heapUsed: 1024,
      external: 0,
      arrayBuffers: 0,
    }));
    // Preserve `.rss()` shape Node provides; the loader only reads the
    // {heapUsed, heapTotal} subset so the stub is sufficient.
    Object.assign(spy, { rss: () => 0 });
    process.memoryUsage = spy as unknown as typeof process.memoryUsage;

    try {
      const response = await callLoader();
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; details: { memoryHeap: { status: string } } };
      expect(body.status).toBe('ok');
      expect(body.details.memoryHeap.status).toBe('up');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      process.memoryUsage = original;
    }
  });

  it('should return 503 + status:error when heap is over threshold', async () => {
    const original = process.memoryUsage;
    const spy = vi.fn(() => ({
      rss: 0,
      heapTotal: heapThresholdBytes * 2,
      heapUsed: heapThresholdBytes + 1,
      external: 0,
      arrayBuffers: 0,
    }));
    Object.assign(spy, { rss: () => 0 });
    process.memoryUsage = spy as unknown as typeof process.memoryUsage;

    try {
      const response = await callLoader();
      expect(response.status).toBe(503);
      const body = (await response.json()) as { status: string; details: { memoryHeap: { status: string } } };
      expect(body.status).toBe('error');
      expect(body.details.memoryHeap.status).toBe('down');
    } finally {
      process.memoryUsage = original;
    }
  });
});
