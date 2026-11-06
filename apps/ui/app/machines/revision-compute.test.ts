import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInlineCompute, serveComputeWorker } from '@taucad/revisions';
import { createRevisionCompute } from '#machines/revision-compute.js';

const bytes = new TextEncoder().encode('blob 5\0hello');
const expected = await createInlineCompute().sha1(bytes);

/** A `Worker` served in-process over a message channel, which records what it was started with. */
const fakeWorkers = (): { started: Array<{ url: string; options: WorkerOptions | undefined }> } => {
  const started: Array<{ url: string; options: WorkerOptions | undefined }> = [];
  class FakeWorker {
    private readonly channel = new MessageChannel();

    public constructor(url: URL, options?: WorkerOptions) {
      started.push({ url: url.href, options });
      serveComputeWorker(this.channel.port2);
      this.channel.port1.start();
    }

    public postMessage(message: unknown, transfer: Transferable[]): void {
      this.channel.port1.postMessage(message, transfer);
    }

    public addEventListener(type: string, listener: (event: Event) => void): void {
      if (type === 'message') {
        this.channel.port1.addEventListener('message', listener);
      }
    }

    public terminate(): void {
      this.channel.port1.close();
      this.channel.port2.close();
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  return { started };
};

describe('createRevisionCompute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should run the work inline where a worker cannot start', async () => {
    vi.stubGlobal('Worker', undefined);
    const compute = createRevisionCompute();
    expect('spawned' in compute).toBe(false);
    expect(await compute.sha1(bytes)).toBe(expected);
  });

  it('should start one module worker on first use and send every call to it', async () => {
    const { started } = fakeWorkers();
    const compute = createRevisionCompute();
    expect(started).toHaveLength(0);
    expect(await compute.sha1(bytes)).toBe(expected);
    expect(await compute.sha1(bytes)).toBe(expected);
    expect(started).toHaveLength(1);
    expect(started[0]?.url).toMatch(/revision-compute\.worker\.ts/u);
    expect(started[0]?.options).toMatchObject({ type: 'module', name: 'tau-revision-compute' });
  });
});
