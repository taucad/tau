import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { commandExporter } from '#model/node/command-exporter.js';
import type { CommandExporterOptions } from '#model/node/command-exporter.js';

const fixture = join(import.meta.dirname, '__fixtures__/protocol-exporter.ts');

const exporterFor = (mode: string, overrides: Partial<CommandExporterOptions> = {}) =>
  commandExporter({
    id: 'fixture',
    extensions: ['py'],
    command: [process.execPath, fixture],
    capabilities: { formats: ['glb'], parameters: true, region: true },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are SCREAMING_SNAKE.
    env: { GEOSPEC_FIXTURE_MODE: mode },
    ...overrides,
  });

const rejection = async (pending: Promise<unknown>): Promise<GeoSpecModelLoadError> => {
  const error: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(GeoSpecModelLoadError);
  return error as GeoSpecModelLoadError;
};

describe('commandExporter', () => {
  it('should pass every request field as a protocol 1 flag and read the artifact the command wrote', async () => {
    const artifact = await exporterFor('ok').export({
      file: 'main.py',
      format: 'glb',
      projectPath: import.meta.dirname,
      parameters: { width: 4 },
      mesh: { linearTolerance: 0.01, angularToleranceDegrees: 5 },
      region: { min: [0, 0, 0], max: [1, 2, 3] },
    });

    expect([...artifact.bytes]).toStrictEqual([1, 2, 3]);
    expect(artifact.format).toBe('glb');
    expect(artifact.sourceUnit).toBe('mm');
    expect(artifact.resources?.map(({ name, bytes }) => [name, [...bytes]])).toStrictEqual([['texture.png', [9]]]);
    const [entry, echo] = artifact.consumedSources ?? [];
    expect(entry).toStrictEqual({ path: 'main.py', sha256: 'b'.repeat(64) });
    const args = JSON.parse(echo?.sha256 ?? '[]') as string[];
    expect(args.filter((argument) => argument.startsWith('--'))).toStrictEqual([
      '--file',
      '--format',
      '--project',
      '--out',
      '--parameters-json',
      '--mesh-linear-tolerance',
      '--mesh-angular-tolerance-degrees',
      '--region-min',
      '--region-max',
    ]);
    expect(args[args.indexOf('--parameters-json') + 1]).toBe('{"width":4}');
    expect(args[args.indexOf('--region-max') + 1]).toBe('1,2,3');
    expect(args[args.indexOf('--project') + 1]).toBe(import.meta.dirname);
  });

  it('should surface the command error document as a typed diagnostic', async () => {
    const error = await rejection(exporterFor('refuse').export({ file: 'main.py', format: 'glb' }));

    expect(error.diagnostics).toMatchObject([
      {
        code: 'FIXTURE_REFUSED',
        message: 'The fixture refused.',
        suggestion: 'Do not.',
        details: { exporter: 'fixture' },
      },
    ]);
  });

  it('should report output that is not a protocol 1 document as GEOSPEC_EXPORTER_FAILED with the stderr tail', async () => {
    const error = await rejection(exporterFor('garbage').export({ file: 'main.py', format: 'glb' }));

    expect(error.diagnostics).toMatchObject([
      { code: 'GEOSPEC_EXPORTER_FAILED', details: { exitCode: 3, stderr: 'fixture stderr' } },
    ]);
  });

  it('should refuse an artifact path outside the output directory', async () => {
    const error = await rejection(exporterFor('escape').export({ file: 'main.py', format: 'glb' }));

    expect(error.diagnostics).toMatchObject([{ code: 'GEOSPEC_EXPORTER_FAILED' }]);
  });

  it('should report a command that cannot start as GEOSPEC_EXPORTER_FAILED', async () => {
    const error = await rejection(
      exporterFor('ok', { command: [join(import.meta.dirname, 'no-such-command')] }).export({
        file: 'main.py',
        format: 'glb',
      }),
    );

    expect(error.diagnostics).toMatchObject([{ code: 'GEOSPEC_EXPORTER_FAILED' }]);
  });

  it('should refuse inline sources and incomplete options at construction', () => {
    expect(() => exporterFor('ok', { capabilities: { formats: ['glb'], inlineSources: true } })).toThrow(
      /inline sources/u,
    );
    expect(() => exporterFor('ok', { command: [] })).toThrow(TypeError);
    expect(() => exporterFor('ok', { capabilities: { formats: [] } })).toThrow(/format/u);
  });
});
