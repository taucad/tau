/* eslint-disable @typescript-eslint/naming-convention -- environment names and Bambu Studio setting keys keep their own spelling */
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BambuStudioError, bambuPlates } from '@taucad/slicer/bambu-studio';
import type {
  BambuStudioCatalog,
  BambuStudioInstallation,
  BambuStudioSelection,
  BambuStudioSettings,
} from '@taucad/slicer/bambu-studio';

import { createBambuStudioService } from '#main/bambu-studio-service.js';
import type { BambuStudioEngine } from '#main/bambu-studio-service.js';

const install: BambuStudioInstallation = {
  executable: '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
  version: '02.08.02.61',
  resourcesDir: '/Applications/BambuStudio.app/Contents/Resources',
};
const catalog: BambuStudioCatalog = {
  installation: install,
  printers: [],
  processes: [],
  filaments: [],
  plates: bambuPlates,
};
const selection: BambuStudioSelection = {
  printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
  process: '0.20mm Standard @BBL X1C',
  filaments: ['Bambu PLA Basic @BBL X1C'],
  plate: 'textured-pei',
};
const settings: BambuStudioSettings = { schema: { type: 'object' }, values: { layer_height: 0.2 }, groups: [] };

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

const fakeEngine = (installation: BambuStudioInstallation | false = install) => ({
  findBambuStudio: vi.fn<BambuStudioEngine['findBambuStudio']>(async () => installation || undefined),
  loadBambuStudioCatalog: vi.fn<BambuStudioEngine['loadBambuStudioCatalog']>(async () => catalog),
  resolveBambuStudioSelection: vi.fn<BambuStudioEngine['resolveBambuStudioSelection']>(() => selection),
  describeBambuStudioSettings: vi.fn<BambuStudioEngine['describeBambuStudioSettings']>(async () => settings),
});

const serviceWith = (engine: ReturnType<typeof fakeEngine>, env: NodeJS.ProcessEnv = {}) =>
  createBambuStudioService({ env, engine });

/** A Bambu Studio data directory holding one user process preset. */
const dataDirectoryWithUserPreset = async (): Promise<{ dataDirectory: string; preset: string }> => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'tau-bambu-studio-data-'));
  directories.push(dataDirectory);
  const processes = join(dataDirectory, 'user', '1234', 'process');
  await mkdir(processes, { recursive: true });
  const preset = join(processes, 'My fine.json');
  await writeFile(preset, '{"inherits":"0.12mm Fine @BBL X1C"}');
  return { dataDirectory, preset };
};

describe('createBambuStudioService', () => {
  describe('status', () => {
    it('should report the version and executable when Bambu Studio is installed', async () => {
      await expect(serviceWith(fakeEngine()).status()).resolves.toEqual({
        available: true,
        version: '02.08.02.61',
        executable: install.executable,
      });
    });

    it('should explain how to point Tau at Bambu Studio when none is found', async () => {
      const status = await serviceWith(fakeEngine(false)).status();

      expect(status).toHaveProperty('available', false);
      expect(status).toHaveProperty('reason', expect.stringContaining('TAU_BAMBU_STUDIO_PATH'));
    });

    it('should look Bambu Studio up in the environment main resolved', async () => {
      const engine = fakeEngine();
      const env = { TAU_BAMBU_STUDIO_PATH: '/opt/BambuStudio.app' };

      await serviceWith(engine, env).status();

      expect(engine.findBambuStudio).toHaveBeenCalledExactlyOnceWith({ env });
    });
  });

  describe('catalog', () => {
    it('should load the catalog for the requested model and nozzle', async () => {
      const engine = fakeEngine();

      await expect(serviceWith(engine).catalog({ model: 'X1C', nozzleDiameter: 0.4 })).resolves.toEqual({
        ok: true,
        value: catalog,
      });
      expect(engine.loadBambuStudioCatalog).toHaveBeenCalledExactlyOnceWith(install, {
        model: 'X1C',
        nozzleDiameter: 0.4,
      });
    });

    it('should reuse a loaded catalog for the same install and filter', async () => {
      const engine = fakeEngine();
      const service = serviceWith(engine);

      await service.catalog({ model: 'X1C' });
      await service.catalog({ model: 'X1C' });
      await service.catalog({ model: 'A1 mini' });

      expect(engine.loadBambuStudioCatalog).toHaveBeenCalledTimes(2);
    });

    it('should reload the catalog when a user preset changes', async () => {
      const { dataDirectory, preset } = await dataDirectoryWithUserPreset();
      const engine = fakeEngine({ ...install, dataDir: dataDirectory });
      const service = serviceWith(engine);

      await service.catalog({ model: 'X1C' });
      await service.catalog({ model: 'X1C' });
      const later = new Date(Date.now() + 60_000);
      await utimes(preset, later, later);
      await service.catalog({ model: 'X1C' });

      expect(engine.loadBambuStudioCatalog).toHaveBeenCalledTimes(2);
    });

    it('should answer a typed refusal when Bambu Studio is not installed', async () => {
      const answer = await serviceWith(fakeEngine(false)).catalog({});

      expect(answer).toHaveProperty('error.code', 'BAMBU_STUDIO_UNAVAILABLE');
      expect(answer).toHaveProperty('error.message', expect.stringContaining('TAU_BAMBU_STUDIO_PATH'));
    });

    it('should retry a load that failed rather than caching the failure', async () => {
      const engine = fakeEngine();
      engine.loadBambuStudioCatalog.mockRejectedValueOnce(
        new BambuStudioError('BAMBU_STUDIO_PRESET_NOT_FOUND', 'No printer preset named "Nope".'),
      );
      const service = serviceWith(engine);

      await expect(service.catalog({ printer: 'Nope' })).resolves.toEqual({
        ok: false,
        error: { code: 'BAMBU_STUDIO_PRESET_NOT_FOUND', message: 'No printer preset named "Nope".' },
      });
      await expect(service.catalog({ printer: 'Nope' })).resolves.toEqual({ ok: true, value: catalog });
    });

    it('should let an unexpected failure reject the call', async () => {
      const engine = fakeEngine();
      engine.loadBambuStudioCatalog.mockRejectedValueOnce(new TypeError('boom'));

      await expect(serviceWith(engine).catalog({})).rejects.toThrow(TypeError);
    });

    it.each([
      ['a string', 'X1C'],
      ['an empty printer name', { printer: '' }],
      ['an oversized model', { model: 'x'.repeat(257) }],
      ['a non-finite nozzle', { nozzleDiameter: Number.NaN }],
      ['a negative nozzle', { nozzleDiameter: -0.4 }],
    ])('should refuse a filter that is %s', async (_label, filter) => {
      const engine = fakeEngine();

      await expect(serviceWith(engine).catalog(filter)).rejects.toThrow(
        'Desktop shell refused invalid Bambu Studio request.',
      );
      expect(engine.findBambuStudio).not.toHaveBeenCalled();
    });
  });

  describe('resolveSelection', () => {
    const hints = { model: 'X1C', nozzleDiameter: 0.4, materials: [{ slot: 0, profileId: 'GFA00' }] };

    it('should resolve defaults from the catalog of the hinted model and nozzle', async () => {
      const engine = fakeEngine();

      await expect(serviceWith(engine).resolveSelection({ hints })).resolves.toEqual({ ok: true, value: selection });
      expect(engine.loadBambuStudioCatalog).toHaveBeenCalledExactlyOnceWith(install, {
        model: 'X1C',
        nozzleDiameter: 0.4,
      });
      expect(engine.resolveBambuStudioSelection).toHaveBeenCalledExactlyOnceWith(catalog, hints, {});
    });

    it('should resolve against the chosen printer preset when one is given', async () => {
      const engine = fakeEngine();
      const partial = {
        printer: 'My X1C',
        settings: { sparse_infill_density: '15%', wall_loops: 3, enable_support: true },
      };

      await serviceWith(engine).resolveSelection({ hints, partial });

      expect(engine.loadBambuStudioCatalog).toHaveBeenCalledExactlyOnceWith(install, { printer: 'My X1C' });
      expect(engine.resolveBambuStudioSelection).toHaveBeenCalledExactlyOnceWith(catalog, hints, partial);
    });

    it('should answer the resolver refusal as a typed error', async () => {
      const engine = fakeEngine();
      engine.resolveBambuStudioSelection.mockImplementationOnce(() => {
        throw new BambuStudioError('BAMBU_STUDIO_PRESET_NOT_FOUND', 'No printer preset for "Z9".');
      });

      await expect(serviceWith(engine).resolveSelection({ hints: { model: 'Z9', materials: [] } })).resolves.toEqual({
        ok: false,
        error: { code: 'BAMBU_STUDIO_PRESET_NOT_FOUND', message: 'No printer preset for "Z9".' },
      });
    });

    it.each([
      ['missing hints', {}],
      ['hints without materials', { hints: { model: 'X1C' } }],
      ['an unknown quality preset', { hints: { ...hints, preset: 'draft' } }],
      ['an unknown plate', { hints: { ...hints, plate: 'glass' } }],
      ['a fractional slot', { hints: { ...hints, materials: [{ slot: 0.5 }] } }],
      ['too many materials', { hints: { ...hints, materials: Array.from({ length: 33 }, (_, slot) => ({ slot })) } }],
      ['too many filaments', { hints, partial: { filaments: Array.from({ length: 33 }, () => 'PLA') } }],
      ['an object setting value', { hints, partial: { settings: { wall_loops: { value: 3 } } } }],
      ['an oversized setting value', { hints, partial: { settings: { start_gcode: 'G'.repeat(65_537) } } }],
      [
        'too many settings',
        {
          hints,
          partial: { settings: Object.fromEntries(Array.from({ length: 2049 }, (_, index) => [`key_${index}`, 1])) },
        },
      ],
    ])('should refuse %s', async (_label, input) => {
      const engine = fakeEngine();

      await expect(serviceWith(engine).resolveSelection(input)).rejects.toThrow(
        'Desktop shell refused invalid Bambu Studio request.',
      );
      expect(engine.findBambuStudio).not.toHaveBeenCalled();
    });
  });

  describe('settings', () => {
    const input = { printer: selection.printer, process: selection.process, filaments: selection.filaments };

    it('should describe the settings of the selected presets', async () => {
      const engine = fakeEngine();

      await expect(serviceWith(engine).settings(input)).resolves.toEqual({ ok: true, value: settings });
      expect(engine.describeBambuStudioSettings).toHaveBeenCalledExactlyOnceWith(install, input);
    });

    it('should reuse described settings for the same presets', async () => {
      const engine = fakeEngine();
      const service = serviceWith(engine);

      await service.settings(input);
      await service.settings({ ...input });

      expect(engine.describeBambuStudioSettings).toHaveBeenCalledOnce();
    });

    it.each([
      ['no process', { printer: selection.printer, filaments: [] }],
      ['a numeric printer', { ...input, printer: 7 }],
      ['a filament that is not a name', { ...input, filaments: [''] }],
    ])('should refuse %s', async (_label, request) => {
      await expect(serviceWith(fakeEngine()).settings(request)).rejects.toThrow(
        'Desktop shell refused invalid Bambu Studio request.',
      );
    });
  });
});
