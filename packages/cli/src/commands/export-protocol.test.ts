import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as OutputModule from '#output.js';

const owner = vi.hoisted(() => ({
  exportModel: vi.fn(),
  close: vi.fn(async () => undefined),
  tauExporter: vi.fn(),
  stdout: [] as string[],
}));

vi.mock('#geospec/tau-exporter.js', () => ({ tauExporter: owner.tauExporter }));
vi.mock('#output.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OutputModule>()),
  writeStdout: async (chunk: string) => {
    owner.stdout.push(chunk);
  },
}));

const { parseProtocolArguments, runExportProtocol } = await import('#commands/export-protocol.js');

const base = ['--file', 'main.ts', '--format', 'glb', '--project', '/work/vise', '--out', '/tmp/out'];

let out = '';

beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), 'tau-protocol-'));
  owner.stdout.length = 0;
  owner.tauExporter.mockImplementation(async () => ({
    capabilities: { formats: ['glb', 'step'] },
    export: owner.exportModel,
    close: owner.close,
  }));
});

afterEach(async () => {
  vi.clearAllMocks();
  await rm(out, { recursive: true, force: true });
});

const document = (): Record<string, unknown> => JSON.parse(owner.stdout.join('')) as Record<string, unknown>;

describe('parseProtocolArguments', () => {
  it('should read every protocol 1 flag into the export request', () => {
    expect(
      parseProtocolArguments([
        ...base,
        '--parameters-json',
        '{"jawWidth":125}',
        '--mesh-linear-tolerance',
        '0.01',
        '--mesh-angular-tolerance-degrees',
        '5',
        '--region-min',
        '0,0,0',
        '--region-max',
        '10,20,30',
        '--plugin',
        './a.mjs',
        '--plugin',
        './b.mjs',
        '--config',
        './tau.config.mjs',
        '--json',
      ]),
    ).toEqual({
      request: {
        file: 'main.ts',
        format: 'glb',
        projectPath: resolve('/work/vise'),
        parameters: { jawWidth: 125 },
        mesh: { linearTolerance: 0.01, angularToleranceDegrees: 5 },
        region: { min: [0, 0, 0], max: [10, 20, 30] },
      },
      out: resolve('/tmp/out'),
      plugins: ['./a.mjs', './b.mjs'],
      config: './tau.config.mjs',
    });
  });

  it('should read a negative region coordinate passed as its own argument', () => {
    expect(
      parseProtocolArguments([...base, '--region-min', '-5,-2.5,0', '--region-max', '5,2.5,4']).request.region,
    ).toEqual({ min: [-5, -2.5, 0], max: [5, 2.5, 4] });
  });

  it('should leave out what the call does not carry', () => {
    expect(parseProtocolArguments([...base, '--mesh-angular-tolerance-degrees', '5'])).toEqual({
      request: {
        file: 'main.ts',
        format: 'glb',
        projectPath: resolve('/work/vise'),
        mesh: { angularToleranceDegrees: 5 },
      },
      out: resolve('/tmp/out'),
      plugins: [],
    });
  });

  it.each([
    [['--file', 'main.ts', '--format', 'glb', '--out', '/tmp/out'], 'needs --file, --format, --project and --out'],
    [[...base, '--unknown'], "Unknown option '--unknown'"],
    [[...base, '--parameters-json', '{'], 'Invalid JSON in --parameters-json'],
    [[...base, '--parameters-json', '[1]'], '--parameters-json must be a JSON object'],
    [[...base, '--mesh-linear-tolerance', 'fine'], '--mesh-linear-tolerance must be a finite number'],
    [[...base, '--mesh-linear-tolerance', ''], '--mesh-linear-tolerance must be a finite number'],
    [[...base, '--region-min', '0,0,0'], '--region-min and --region-max come together'],
    [[...base, '--region-min', '0,0', '--region-max', '1,1,1'], '--region-min must be three comma-separated numbers'],
  ])('should refuse %j as an unusable request', (argv, message) => {
    expect(() => parseProtocolArguments(argv)).toThrow(message);
    expect(() => parseProtocolArguments(argv)).toThrow(expect.objectContaining({ code: 'ARG_INVALID', exit: 2 }));
  });
});

describe('runExportProtocol', () => {
  const call = async (...extra: string[]): Promise<number> =>
    runExportProtocol(['--file', 'main.ts', '--format', 'glb', '--project', '/work/vise', '--out', out, ...extra]);

  it('should write the artifact under --out and print one protocol 1 document', async () => {
    owner.exportModel.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      format: 'glb',
      sourceUnit: 'mm',
      resources: [{ name: 'textures/wood.png', bytes: new Uint8Array([4]) }],
      consumedSources: [{ path: 'main.ts', sha256: 'abc' }],
    });

    const exit = await call('--plugin', './zoo.mjs', '--config', './tau.config.mjs');

    expect(exit).toBe(0);
    expect(owner.tauExporter).toHaveBeenCalledWith({
      projectPath: resolve('/work/vise'),
      plugins: ['./zoo.mjs'],
      config: './tau.config.mjs',
    });
    expect(owner.exportModel).toHaveBeenCalledWith({
      file: 'main.ts',
      format: 'glb',
      projectPath: resolve('/work/vise'),
    });
    expect(document()).toEqual({
      protocol: 1,
      format: 'glb',
      sourceUnit: 'mm',
      primary: 'model.glb',
      resources: [{ name: 'textures/wood.png', path: 'textures/wood.png' }],
      consumedSources: [{ path: 'main.ts', sha256: 'abc' }],
    });
    expect([...(await readFile(join(out, 'model.glb')))]).toEqual([1, 2, 3]);
    expect([...(await readFile(join(out, 'textures/wood.png')))]).toEqual([4]);
    expect(owner.close).toHaveBeenCalledOnce();
  });

  it('should report no source unit or consumed sources the export did not give', async () => {
    owner.exportModel.mockResolvedValue({ bytes: new Uint8Array([1]), format: 'step' });

    expect(await call()).toBe(0);
    expect(document()).toEqual({
      protocol: 1,
      format: 'step',
      primary: 'model.step',
      resources: [],
      consumedSources: [],
    });
  });

  it('should refuse a resource named outside --out without writing it', async () => {
    owner.exportModel.mockResolvedValue({
      bytes: new Uint8Array([1]),
      format: 'glb',
      resources: [{ name: '../escape.bin', bytes: new Uint8Array([9]) }],
    });

    expect(await call()).toBe(1);
    expect(document()).toEqual({
      protocol: 1,
      error: { code: 'EXPORT_FAILED', message: 'The export named an artifact outside --out: ../escape.bin' },
    });
    expect(owner.close).toHaveBeenCalledOnce();
  });

  it("should carry a GeoSpec diagnostic's code and suggestion, exiting 3 when the runtime declined", async () => {
    owner.exportModel.mockRejectedValue(
      Object.assign(new Error('load failed'), {
        diagnostics: [{ code: 'KERNEL_NOT_PREPARED', message: 'Prepare build123d.', suggestion: 'Run tau prepare.' }],
      }),
    );

    expect(await call()).toBe(3);
    expect(document()).toEqual({
      protocol: 1,
      error: { code: 'KERNEL_NOT_PREPARED', message: 'Prepare build123d.', suggestion: 'Run tau prepare.' },
    });
  });

  it('should exit 1 for a model that fails to export', async () => {
    owner.exportModel.mockRejectedValue(
      Object.assign(new Error('load failed'), { diagnostics: [{ code: 'MODEL_ERROR', message: 'boom' }] }),
    );

    expect(await call()).toBe(1);
    expect(document()).toEqual({ protocol: 1, error: { code: 'MODEL_ERROR', message: 'boom' } });
  });

  it('should report an unusable request as a document, exiting 2', async () => {
    expect(await runExportProtocol(['--out', out])).toBe(2);
    expect(document()).toMatchObject({ protocol: 1, error: { code: 'ARG_INVALID' } });
    expect(owner.tauExporter).not.toHaveBeenCalled();
  });

  it('should refuse a format the exporter does not declare as an unusable request, exporting nothing', async () => {
    expect(
      await runExportProtocol(['--file', 'main.ts', '--format', 'stl', '--project', '/work/vise', '--out', out]),
    ).toBe(2);
    expect(document()).toEqual({
      protocol: 1,
      error: { code: 'ARG_INVALID', message: '--format must be glb or step, not "stl".' },
    });
    expect(owner.exportModel).not.toHaveBeenCalled();
    expect(owner.close).toHaveBeenCalledOnce();
  });

  it('should report a runtime that cannot be composed under its own code', async () => {
    owner.tauExporter.mockRejectedValue(
      Object.assign(new Error('no such plugin'), { code: 'PLUGIN_NOT_FOUND', exit: 3 }),
    );

    expect(await call()).toBe(3);
    expect(document()).toEqual({ protocol: 1, error: { code: 'PLUGIN_NOT_FOUND', message: 'no such plugin' } });
  });

  it('should report anything else thrown as an export failure', async () => {
    owner.exportModel.mockRejectedValue('worker lost');

    expect(await call()).toBe(1);
    expect(document()).toEqual({ protocol: 1, error: { code: 'EXPORT_FAILED', message: 'worker lost' } });
  });
});
