import { describe, expect, it } from 'vitest';
import { loadOpenscadManifest, loadOpenscadServer, sha256Hex, wrapOpenscadServer } from '#wasm-host.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

const manifest = {
  format: 'tau-openscad-language-v1',
  toolchain: { rust: '1.97.0', treeSitter: '0.27.1', grammar: '0.7.1' },
  module: { path: 'tau_openscad_language.wasm', sha256: 'b'.repeat(64), byteLength: 3 },
};

const serve =
  (entries: Record<string, Uint8Array<ArrayBuffer>>): typeof fetch =>
  async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const bytes = entries[url.pathname];
    return bytes ? new Response(bytes) : new Response(undefined, { status: 404 });
  };

describe('loadOpenscadManifest', () => {
  it('admits a manifest whose bytes match the build identity', async () => {
    const bytes = encode(manifest);
    const loaded = await loadOpenscadManifest({
      assets: { url: 'https://tau.test/openscad-language/x/assets-manifest.json', sha256: await sha256Hex(bytes) },
      fetch: serve({ '/openscad-language/x/assets-manifest.json': bytes }),
    });
    expect(loaded.manifest.module.path).toBe('tau_openscad_language.wasm');
    expect(loaded.base.href).toBe('https://tau.test/openscad-language/x/');
  });

  it('refuses changed, malformed, missing and credentialed manifests', async () => {
    const bytes = encode(manifest);
    const bad = encode({ ...manifest, module: { ...manifest.module, path: '../escape.wasm' } });
    const fetcher = serve({ '/m.json': bytes, '/bad.json': bad });
    await expect(
      loadOpenscadManifest({ assets: { url: 'https://tau.test/m.json', sha256: 'c'.repeat(64) }, fetch: fetcher }),
    ).rejects.toThrow('OpenSCAD language manifest integrity mismatch.');
    await expect(
      loadOpenscadManifest({
        assets: { url: 'https://tau.test/bad.json', sha256: await sha256Hex(bad) },
        fetch: fetcher,
      }),
    ).rejects.toThrow();
    await expect(
      loadOpenscadManifest({
        assets: { url: 'https://tau.test/missing.json', sha256: 'c'.repeat(64) },
        fetch: fetcher,
      }),
    ).rejects.toThrow('OpenSCAD language asset download failed (404): /missing.json');
    await expect(
      loadOpenscadManifest({
        assets: { url: 'https://user:pw@tau.test/m.json', sha256: 'c'.repeat(64) },
        fetch: fetcher,
      }),
    ).rejects.toThrow('Invalid OpenSCAD language manifest URL.');
  });
});

describe('loadOpenscadServer', () => {
  it('refuses a module that differs from the manifest before instantiating it', async () => {
    const bytes = encode(manifest);
    await expect(
      loadOpenscadServer({
        assets: { url: 'https://tau.test/m.json', sha256: await sha256Hex(bytes) },
        fetch: serve({ '/m.json': bytes, '/tau_openscad_language.wasm': new Uint8Array([1, 2, 3]) }),
      }),
    ).rejects.toThrow('OpenSCAD language module integrity mismatch.');
  });
});

describe('wrapOpenscadServer', () => {
  it('copies messages into module memory and reads responses back', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const received: string[] = [];
    let response = '';
    const instance = {
      exports: {
        memory,
        osl_alloc: () => 64,
        osl_handle(pointer: number, length: number): number {
          received.push(new TextDecoder().decode(new Uint8Array(memory.buffer, pointer, length)));
          const encoded = new TextEncoder().encode(response);
          new Uint8Array(memory.buffer, 1024, encoded.length).set(encoded);
          return encoded.length;
        },
        osl_response: () => 1024,
      },
    } as unknown as WebAssembly.Instance;
    const server = wrapOpenscadServer(instance);
    response = '{"id":1,"result":"é"}';
    expect(server.handle('{"id":1,"method":"x"}')).toBe('{"id":1,"result":"é"}');
    response = '';
    expect(server.handle('{"method":"y"}')).toBeUndefined();
    expect(received).toEqual(['{"id":1,"method":"x"}', '{"method":"y"}']);
  });
});
