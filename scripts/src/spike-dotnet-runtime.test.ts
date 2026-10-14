import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/spike-w1-mac.yml'), 'utf8');
const start = workflow.indexOf('const fetchDotnet =');
const end = workflow.indexOf('const summarize =', start);
const source = `${workflow.slice(start, end)}\nfetchDotnet;`;
const bytes = Buffer.from('fixture runtime archive');
const digest = createHash('sha512').update(bytes).digest('hex');
const runtime = {
  name: 'dotnet-runtime-osx-arm64.tar.gz',
  rid: 'osx-arm64',
  url: 'https://example.invalid/runtime',
  hash: digest,
};
const apphost = { ...runtime, name: 'dotnet-apphost-pack-osx-arm64.tar.gz', url: 'https://example.invalid/apphost' };

const fixture = (files: Array<typeof runtime>, version = '10.0.11') => {
  const fetchBytes = vi.fn(async () => ({ bytes, milliseconds: 1 }));
  const write = vi.fn();
  const fetchDotnet = runInNewContext(source, {
    fetch: async () => ({ json: async () => ({ releases: [{ runtime: { version, files } }] }) }),
    fetchBytes,
    hex: (algorithm: string, data: Uint8Array<ArrayBuffer>) => createHash(algorithm).update(data).digest('hex'),
    join,
    write,
  }) as (seed: string) => Promise<unknown>;
  return { fetchDotnet, fetchBytes, write };
};

describe('spike .NET runtime archive identity', () => {
  it('should select the runtime muxer archive even when the apphost pack is listed first', async () => {
    const { fetchDotnet, fetchBytes, write } = fixture([apphost, runtime]);
    await fetchDotnet('/seed');
    expect(fetchBytes).toHaveBeenCalledExactlyOnceWith(runtime.url);
    expect(write).toHaveBeenCalledExactlyOnceWith('/seed/archives', 'dotnet-runtime-10.0.11-osx-arm64.tar.gz', bytes);
  });

  it('should refuse an apphost-only release before downloading or writing an archive', async () => {
    const { fetchDotnet, fetchBytes, write } = fixture([apphost]);
    await expect(fetchDotnet('/seed')).rejects.toThrow('Missing or ambiguous .NET runtime 10.0.11 osx-arm64 archive');
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('should refuse a different release rather than substitute its runtime', async () => {
    const { fetchDotnet, fetchBytes } = fixture([runtime], '10.0.12');
    await expect(fetchDotnet('/seed')).rejects.toThrow('Missing or ambiguous .NET runtime 10.0.11 osx-arm64 archive');
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('should preserve SHA512 verification before writing the selected runtime', async () => {
    const { fetchDotnet, write } = fixture([{ ...runtime, hash: '0'.repeat(128) }]);
    await expect(fetchDotnet('/seed')).rejects.toThrow('.NET runtime digest mismatch');
    expect(write).not.toHaveBeenCalled();
  });

  it('should refuse duplicate runtime candidates before downloading either', async () => {
    const { fetchDotnet, fetchBytes, write } = fixture([
      runtime,
      { ...runtime, url: 'https://example.invalid/duplicate' },
    ]);
    await expect(fetchDotnet('/seed')).rejects.toThrow('Missing or ambiguous .NET runtime 10.0.11 osx-arm64 archive');
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
