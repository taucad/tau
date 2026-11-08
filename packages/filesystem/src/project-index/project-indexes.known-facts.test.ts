import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import { tauPathPolicy } from '#path-registry.js';

/* A root whose mtimes are trustworthy, with every content read counted (the index's own snapshot aside). */
const durableRoot = async (): Promise<{ provider: MemoryProvider; reads: () => number }> => {
  const provider = new MemoryProvider();
  Object.defineProperty(provider, 'capabilities', { value: { ...provider.capabilities, trustworthyMtime: true } });
  await provider.mkdir('project', { recursive: true });
  const readFile = vi.spyOn(provider, 'readFile');
  return {
    provider,
    reads: () => readFile.mock.calls.filter(([path]) => !String(path).includes('.tau/index')).length,
  };
};

const indexesOver = (provider: MemoryProvider): ProjectIndexes =>
  new ProjectIndexes({
    resolve: () => ({ provider, path: 'project', persist: { lockName: 'tau-index:test:project' } }),
    policy: tauPathPolicy,
    tab: () => ({ tabId: 'tab-a', seq: 0 }),
    persistDelayMilliseconds: 60_000,
  });

const recordOf = (at: number, entries: ReadonlyArray<Readonly<{ path: string; size: number; oid: string }>>): string =>
  JSON.stringify({
    version: 1,
    operationId: 'req_import',
    pin: { kind: 'zip', name: 'x', size: 1, entries: entries.length },
    at,
    entries: entries.map(({ path, size, oid }) => ({
      path,
      size,
      mtimeMs: 1_000_000,
      facts: { contentKind: 'text', blobOid: oid, sha256: 'e'.repeat(64) },
    })),
  });

describe('facts the index already holds (D12: a first revision from recorded oids)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should answer only recorded facts, reading no file, when asked not to measure', async () => {
    const { provider, reads } = await durableRoot();
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    await provider.writeFile('project/kept.txt', 'kept');
    await provider.writeFile('project/unrecorded.txt', 'none');
    vi.setSystemTime(1_010_000);
    await provider.writeFile(
      'project/.tau/import.json',
      recordOf(1_010_000, [{ path: 'kept.txt', size: 4, oid: 'a'.repeat(40) }]),
    );
    vi.setSystemTime(1_020_000);
    const indexes = indexesOver(provider);
    await indexes.ready('/project');
    const before = reads();

    const facts = await indexes.facts('/project', ['kept.txt', 'unrecorded.txt'], {
      digests: ['blobOid'],
      measure: false,
    });

    expect(facts.get('kept.txt')?.blobOid).toBe('a'.repeat(40));
    expect(facts.has('unrecorded.txt')).toBe(false);
    /* The record alone. */
    expect(reads() - before).toBe(1);
  });

  it('should answer an import record only while a stat finds the file at its size and mtime', async () => {
    const { provider } = await durableRoot();
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    await provider.writeFile('project/kept.txt', 'kept');
    await provider.writeFile('project/changed.txt', 'abcd');
    await provider.writeFile('project/measured.txt', 'self');
    vi.setSystemTime(1_010_000);
    await provider.writeFile(
      'project/.tau/import.json',
      recordOf(1_010_000, [
        { path: 'kept.txt', size: 4, oid: 'a'.repeat(40) },
        { path: 'changed.txt', size: 4, oid: 'b'.repeat(40) },
      ]),
    );
    vi.setSystemTime(1_020_000);
    const indexes = indexesOver(provider);
    await indexes.ready('/project');
    /* The index measures this one itself: not a fact the import recorded. */
    await indexes.facts('/project', ['measured.txt'], { digests: ['blobOid'] });
    /* The same size, rewritten after the record and not yet observed by the index. */
    vi.setSystemTime(1_030_000);
    await provider.writeFile('project/changed.txt', 'wxyz');

    const facts = await indexes.facts('/project', ['kept.txt', 'changed.txt', 'measured.txt'], {
      digests: ['blobOid'],
      measure: false,
      recorded: 'import',
    });

    expect(facts.get('kept.txt')?.blobOid).toBe('a'.repeat(40));
    expect(facts.has('changed.txt')).toBe(false);
    expect(facts.has('measured.txt')).toBe(false);
  });

  it('should measure what it does not hold when measuring is allowed', async () => {
    const { provider } = await durableRoot();
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    await provider.writeFile('project/unrecorded.txt', 'none');
    vi.setSystemTime(1_020_000);

    const facts = await indexesOver(provider).facts('/project', ['unrecorded.txt'], { digests: ['blobOid'] });

    expect(facts.get('unrecorded.txt')?.blobOid).toMatch(/^[0-9a-f]{40}$/u);
  });
});
