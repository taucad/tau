import { describe, expect, it } from 'vitest';
import { loadCsharpManifest, loadCsharpServer, sha256Hex } from '#dotnet-host.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

const manifest = {
  format: 'tau-csharp-language-v1',
  toolchain: { sdk: '10.0.400', runtime: '10.0.11', picoGk: 'abc' },
  bootstrap: '_framework/dotnet.js',
  references: 'references.bin.gz',
  files: [{ path: 'references.bin.gz', sha256: 'b'.repeat(64), byteLength: 3 }],
};

const serve =
  (entries: Record<string, Uint8Array<ArrayBuffer>>): typeof fetch =>
  async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const bytes = entries[url.pathname];
    return bytes ? new Response(bytes) : new Response(undefined, { status: 404 });
  };

describe('loadCsharpManifest', () => {
  it('admits a manifest whose bytes match the build identity', async () => {
    const bytes = encode(manifest);
    const loaded = await loadCsharpManifest({
      assets: { url: 'https://tau.test/csharp-language/x/assets-manifest.json', sha256: await sha256Hex(bytes) },
      fetch: serve({ '/csharp-language/x/assets-manifest.json': bytes }),
    });
    expect(loaded.manifest.bootstrap).toBe('_framework/dotnet.js');
    expect(loaded.base.href).toBe('https://tau.test/csharp-language/x/');
  });

  it('refuses changed, malformed, missing and credentialed manifests', async () => {
    const bytes = encode(manifest);
    const fetcher = serve({ '/m.json': bytes, '/bad.json': encode({ ...manifest, bootstrap: '../escape.js' }) });
    await expect(
      loadCsharpManifest({ assets: { url: 'https://tau.test/m.json', sha256: 'c'.repeat(64) }, fetch: fetcher }),
    ).rejects.toThrow('C# language manifest integrity mismatch.');
    const bad = encode({ ...manifest, bootstrap: '../escape.js' });
    await expect(
      loadCsharpManifest({
        assets: { url: 'https://tau.test/bad.json', sha256: await sha256Hex(bad) },
        fetch: fetcher,
      }),
    ).rejects.toThrow();
    await expect(
      loadCsharpManifest({ assets: { url: 'https://tau.test/missing.json', sha256: 'c'.repeat(64) }, fetch: fetcher }),
    ).rejects.toThrow('C# language asset download failed (404): /missing.json');
    await expect(
      loadCsharpManifest({
        assets: { url: 'https://user:pw@tau.test/m.json', sha256: 'c'.repeat(64) },
        fetch: fetcher,
      }),
    ).rejects.toThrow('Invalid C# language manifest URL.');
  });
});

describe('loadCsharpServer', () => {
  it('refuses a reference bundle that differs from the manifest before booting the runtime', async () => {
    const bytes = encode(manifest);
    let imported = false;
    await expect(
      loadCsharpServer({
        assets: { url: 'https://tau.test/m.json', sha256: await sha256Hex(bytes) },
        fetch: serve({ '/m.json': bytes, '/references.bin.gz': new Uint8Array([1, 2, 3]) }),
        importBootstrap: async () => {
          imported = true;
          return {
            dotnet: {
              create: async () => {
                throw new Error('runtime must not start');
              },
            },
          };
        },
      }),
    ).rejects.toThrow('C# reference bundle integrity mismatch.');
    expect(imported).toBe(true);
  });

  it('refuses a manifest that does not list its reference bundle', async () => {
    const bytes = encode({ ...manifest, files: [{ path: 'other.bin', sha256: 'b'.repeat(64), byteLength: 1 }] });
    await expect(
      loadCsharpServer({
        assets: { url: 'https://tau.test/m.json', sha256: await sha256Hex(bytes) },
        fetch: serve({ '/m.json': bytes }),
      }),
    ).rejects.toThrow('The C# language manifest does not list its reference bundle.');
  });
});
