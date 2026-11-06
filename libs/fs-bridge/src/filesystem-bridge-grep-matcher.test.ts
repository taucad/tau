/**
 * The bounded grep matcher on each platform it serves: a web `Worker` from a
 * `blob:` URL (stood in for by a `worker_threads` worker running the same
 * source), a Node worker, and a platform with neither.
 */
import { resolveObjectURL } from 'node:buffer';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedLineMatcher, literalLineMatcher, matchFileLines } from '#filesystem-bridge-grep-matcher.js';
import { nodeGrepMatcherWorker, nodeWorkerScript } from '#filesystem-bridge-rooted.test-fixture.js';

/** A web `Worker` over a `blob:` URL, run by Node: what the authority's browser worker spawns. */
class WebWorkerOverNode extends EventTarget {
  private readonly inner: Promise<NodeWorker>;

  public constructor(url: string) {
    super();
    this.inner = (async () => {
      const source = await resolveObjectURL(url)!.text();
      const worker = new NodeWorker(nodeWorkerScript(source), { eval: true });
      worker.on('message', (data: unknown) => {
        this.dispatchEvent(new MessageEvent('message', { data }));
      });
      return worker;
    })();
  }

  public async postMessage(message: unknown): Promise<void> {
    const worker = await this.inner;
    worker.postMessage(message);
  }

  public async terminate(): Promise<void> {
    const worker = await this.inner;
    await worker.terminate();
  }
}

/** A web worker that fails as soon as it is asked anything. */
class FailingWebWorker extends EventTarget {
  public postMessage(): void {
    queueMicrotask(() => {
      this.dispatchEvent(Object.assign(new Event('error'), { message: 'script failed to load' }));
    });
  }

  public terminate(): void {
    // Nothing runs.
  }
}

const shape = (source: string) => ({ expression: new RegExp(source, 'iu'), context: 1, maxLine: 8 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bounded grep matcher', () => {
  it("matches on a Node host's worker exactly as on the calling thread", async () => {
    const text = 'alpha\nBeta beta beta beta\ngamma';
    const matcher = await boundedLineMatcher({ ...shape('beta'), worker: nodeGrepMatcherWorker });
    try {
      const matches = await matcher.match('a.txt', text);
      expect(matches).toEqual(matchFileLines({ ...shape('beta'), path: 'a.txt', text }));
      expect(matches).toEqual([
        { path: 'a.txt', line: 2, column: 1, text: 'Beta bet', before: ['alpha'], after: ['gamma'] },
      ]);
    } finally {
      matcher.close();
    }
  });

  it('serves a web Worker from a blob: URL and stops an overrun there too', async () => {
    vi.stubGlobal('Worker', WebWorkerOverNode);
    const matcher = await boundedLineMatcher(shape('^(a+)+$'));
    try {
      await expect(matcher.match('fine.txt', 'aaa')).resolves.toHaveLength(1);
      await expect(matcher.match('evil.txt', `${'a'.repeat(40)}!`)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
      // A stopped matcher refuses every later file with the same failure.
      await expect(matcher.match('fine.txt', 'aaa')).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    } finally {
      matcher.close();
    }
  });

  it('fails EIO when its worker does not run', async () => {
    vi.stubGlobal('Worker', FailingWebWorker);
    await expect(boundedLineMatcher(shape('x'))).rejects.toMatchObject({ code: 'EIO' });
  });

  it('refuses with ENOTSUP on a host with neither a web Worker nor a factory', async () => {
    await expect(boundedLineMatcher(shape('x'))).rejects.toMatchObject({ code: 'ENOTSUP' });
  });

  it('matches a literal on the calling thread', async () => {
    const matcher = literalLineMatcher({ expression: /a\.b/iu, context: 0, maxLine: 8 });
    await expect(matcher.match('x', 'a.b\naxb')).resolves.toEqual([{ path: 'x', line: 1, column: 1, text: 'a.b' }]);
    matcher.close();
  });
});
