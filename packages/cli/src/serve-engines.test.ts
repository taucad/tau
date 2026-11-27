import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  installedEngines,
  prepareServeEngines,
  readServedEnginesManifest,
  servedEnginesManifestName,
  serveEngines,
  sha256OfResponse,
  smokeTestEngine,
} from '#serve-engines.js';
import type { InstalledEngines, ServedEnginesManifest } from '#serve-engines.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const digest = (seed: string, byteLength: number): { sha256: string; byteLength: number } => ({
  sha256: createHash('sha256').update(seed).digest('hex'),
  byteLength,
});

const installed: InstalledEngines = {
  version: '0.1.0-beta.5',
  directory: '/opt/tau/node_modules/cadmpeg-ts/dist/wasm',
  modules: { sldprt: digest('sldprt', 25_306_221), step: digest('step', 12_775_293) },
};

const manifest = (overrides: Partial<ServedEnginesManifest> = {}): ServedEnginesManifest => ({
  schemaVersion: 1,
  package: 'cadmpeg-ts',
  version: installed.version,
  path: '/cadmpeg-engines/',
  modules: installed.modules,
  ...overrides,
});

describe('serveEngines (EQ1 option A)', () => {
  it('mounts the installed engine directory at the path the UI names when version and digests agree', () => {
    expect(serveEngines(manifest(), installed)).toEqual({
      status: 'mounted',
      version: '0.1.0-beta.5',
      mount: { path: '/cadmpeg-engines/', root: installed.directory },
      modules: installed.modules,
    });
  });

  it('mounts nothing for a UI that names no engines', () => {
    expect(serveEngines(undefined, installed)).toEqual({ status: 'none' });
  });

  it('refuses a version skew with a warning naming both versions and the fix', () => {
    const outcome = serveEngines(manifest({ version: '0.1.0-beta.4' }), installed);
    expect(outcome.status).toBe('skew');
    const { message } = outcome as { message: string };
    expect(message).toContain('built against cadmpeg-ts 0.1.0-beta.4 engines');
    expect(message).toContain('this CLI has cadmpeg-ts 0.1.0-beta.5 installed');
    expect(message).toContain('Native CAD import');
    expect(message).toContain('npm install -g @taucad/cli@latest');
    expect(message).toContain('--ui=<a Tau UI serve build made against cadmpeg-ts 0.1.0-beta.5>');
  });

  it('refuses a digest skew under one version, naming the engine', () => {
    const outcome = serveEngines(
      manifest({ modules: { ...installed.modules, step: digest('rebuilt step', 12_775_293) } }),
      installed,
    );
    expect(outcome).toMatchObject({ status: 'skew' });
    expect((outcome as { message: string }).message).toContain('whose step digest differs');
  });

  it('refuses when the UI lists an engine the CLI does not have, or the reverse', () => {
    expect(serveEngines(manifest({ modules: { sldprt: installed.modules['sldprt']! } }), installed)).toMatchObject({
      status: 'skew',
    });
    expect(
      serveEngines(manifest({ modules: { ...installed.modules, usd: digest('usd', 1) } }), installed),
    ).toMatchObject({ status: 'skew' });
  });

  it('refuses when the CLI cannot resolve its own cadmpeg-ts', () => {
    const outcome = serveEngines(manifest(), new Error('Cannot find module cadmpeg-ts'));
    expect(outcome).toMatchObject({ status: 'skew' });
    expect((outcome as { message: string }).message).toContain('expects cadmpeg-ts 0.1.0-beta.5 engines');
  });
});

describe('readServedEnginesManifest', () => {
  it('reads a schema 1 manifest', () => {
    expect(readServedEnginesManifest(structuredClone(manifest()))).toEqual(manifest());
  });

  it.each([
    ['another schema', { schemaVersion: 2 }],
    ['another package', { package: 'other' }],
    ['no version', { version: '' }],
    ['a relative path', { path: 'cadmpeg-engines/' }],
    ['a nested path', { path: '/a/b/' }],
    ['a traversal path', { path: '/../' }],
    ['no engines', { modules: {} }],
    ['a short digest', { modules: { sldprt: { sha256: 'ab', byteLength: 1 } } }],
    ['a zero length', { modules: { sldprt: { ...digest('x', 1), byteLength: 0 } } }],
    ['a module id with a separator', { modules: { '../x': digest('x', 1) } }],
  ])('refuses %s', (_case, overrides) => {
    expect(() => readServedEnginesManifest({ ...manifest(), ...overrides })).toThrow(TypeError);
  });
});

describe('prepareServeEngines', () => {
  const uiWith = async (content?: string): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-serve-engines-'));
    roots.push(root);
    if (content !== undefined) {
      await writeFile(join(root, servedEnginesManifestName), content);
    }
    return root;
  };

  it('reads the manifest at the UI root and mounts', async () => {
    const root = await uiWith(JSON.stringify(manifest()));
    await expect(prepareServeEngines(root, async () => installed)).resolves.toMatchObject({ status: 'mounted' });
  });

  it('answers none, without resolving the CLI engines, for a UI with no manifest', async () => {
    const root = await uiWith();
    await expect(
      prepareServeEngines(root, async () => {
        throw new Error('not asked');
      }),
    ).resolves.toEqual({ status: 'none' });
  });

  it('throws on a malformed manifest', async () => {
    const root = await uiWith('{"schemaVersion":1}');
    await expect(prepareServeEngines(root, async () => installed)).rejects.toThrow(TypeError);
  });

  it('turns a resolution failure into a skew warning', async () => {
    const root = await uiWith(JSON.stringify(manifest()));
    await expect(
      prepareServeEngines(root, async () => {
        throw new Error('missing');
      }),
    ).resolves.toMatchObject({ status: 'skew' });
  });
});

describe('installedEngines', () => {
  it('resolves the cadmpeg-ts that @taucad/cadmpeg loads, with its version, engine directory and digests', async () => {
    const engines = await installedEngines();
    const packageJson = JSON.parse(await readFile(join(engines.directory, '..', '..', 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(packageJson).toMatchObject({ name: 'cadmpeg-ts', version: engines.version });
    expect(Object.keys(engines.modules)).toContain('sldprt');
    /* The directory holds the bytes the digests name. */
    const smallest = smokeTestEngine(engines.modules);
    const bytes = await readFile(join(engines.directory, `${smallest.id}_bg.wasm`));
    expect(bytes.byteLength).toBe(smallest.byteLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(smallest.sha256);
  });
});

describe('smokeTestEngine and sha256OfResponse', () => {
  it('picks the smallest engine', () => {
    expect(smokeTestEngine(installed.modules).id).toBe('step');
  });

  it('hashes a streamed body', async () => {
    const body = new Uint8Array([1, 2, 3]);
    await expect(sha256OfResponse(new Response(body))).resolves.toEqual({
      sha256: createHash('sha256').update(body).digest('hex'),
      byteLength: 3,
    });
  });
});
