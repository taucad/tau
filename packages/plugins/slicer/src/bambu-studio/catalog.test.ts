import { access, mkdir, mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadBambuStudioCatalog, openBambuPresets } from '#bambu-studio/catalog.js';
import { writeFakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import type { FakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import { findBambuStudio } from '#bambu-studio/installation.js';
import { matchesPrinterModel, resolveBambuStudioSelection } from '#bambu-studio/selection.js';
import type { BambuStudioCatalog } from '#bambu-studio/types.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio preset and result keys are fixed snake_case names. */

const names = (presets: ReadonlyArray<{ name: string }>): string[] => presets.map(({ name }) => name).toSorted();

describe('Bambu Studio catalog', () => {
  let root: string;
  let fake: FakeInstall;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-bambu-catalog-'));
    fake = await writeFakeInstall(join(root, 'newer-system'), {
      bundledVersion: '01.02.00.01',
      systemVersion: '01.02.00.10',
      user: true,
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('resolution', () => {
    it('should apply the inherits chain, then includes in order, then own keys', async () => {
      const library = await openBambuPresets(fake.install);
      const filament = library.resolve('filament', 'Bambu PETG Basic @BBL X1C');
      expect(filament).toMatchObject({
        filament_type: ['PETG'],
        filament_id: 'GFG00',
        nozzle_temperature: ['250'],
        note_a: 'template',
        note_b: 'own',
      });
      expect(filament).not.toHaveProperty('inherits');
      expect(filament).not.toHaveProperty('include');
      expect(library.resolve('machine', 'Bambu Lab X1 Carbon 0.4 nozzle')).toMatchObject({
        start_note: 'template',
        end_note: 'own',
        retraction_length: ['1'],
      });
    });

    it('should resolve user presets against the system presets', async () => {
      const library = await openBambuPresets(fake.install);
      expect(library.resolve('filament', 'My PETG')).toMatchObject({
        filament_id: 'GFG00',
        nozzle_temperature: ['245'],
        note_b: 'own',
        from: 'User',
      });
    });

    it('should prefer the newer of the bundled and OTA system presets', async () => {
      const newerSystem = await openBambuPresets(fake.install);
      expect(newerSystem.resolve('process', '0.20mm Standard @BBL X1C')).toMatchObject({ origin: 'system' });
      const olderSystem = await writeFakeInstall(join(root, 'older-system'), {
        bundledVersion: '01.03.00.01',
        systemVersion: '01.02.00.10',
      });
      const library = await openBambuPresets(olderSystem.install);
      expect(library.resolve('process', '0.20mm Standard @BBL X1C')).toMatchObject({ origin: 'bundled' });
    });

    it('should refuse a missing preset with the preset named', async () => {
      const library = await openBambuPresets(fake.install);
      expect(() => library.resolve('filament', 'Orphan')).toThrow(
        expect.objectContaining({
          name: 'BambuStudioError',
          code: 'BAMBU_STUDIO_PRESET_NOT_FOUND',
          message: 'Bambu Studio has no filament preset "A preset that does not exist" (needed by "Orphan").',
        }),
      );
    });
  });

  describe('listing', () => {
    it('should list selectable system presets and user presets with their resolved facts', async () => {
      const catalog = await loadBambuStudioCatalog(fake.install);
      expect(names(catalog.printers)).toEqual([
        'Bambu Lab A1 mini 0.4 nozzle',
        'Bambu Lab X1 Carbon 0.4 nozzle',
        'Bambu Lab X1 Carbon 0.6 nozzle',
        'X1C mine',
      ]);
      expect(catalog.printers.find(({ name }) => name === 'Bambu Lab X1 Carbon 0.4 nozzle')).toEqual({
        name: 'Bambu Lab X1 Carbon 0.4 nozzle',
        kind: 'machine',
        source: 'system',
        settingId: 'DM1',
        printerModel: 'Bambu Lab X1 Carbon',
        nozzleDiameter: 0.4,
      });
      // Templates and bases are not selectable; the orphaned user preset cannot resolve.
      expect(names(catalog.filaments)).not.toContain('Bambu PETG Basic @base');
      expect(names(catalog.filaments)).not.toContain('Orphan');
      expect(catalog.filaments.find(({ name }) => name === 'My PETG')).toEqual({
        name: 'My PETG',
        kind: 'filament',
        source: 'user',
        filamentId: 'GFG00',
        filamentType: 'PETG',
        compatiblePrinters: ['Bambu Lab X1 Carbon 0.4 nozzle', 'X1C mine'],
      });
      expect(catalog.plates.map(({ id, bambuName }) => `${id}=${bambuName}`)).toEqual([
        'cool=Cool Plate',
        'engineering=Engineering Plate',
        'high-temperature=High Temp Plate',
        'textured-pei=Textured PEI Plate',
      ]);
    });

    it('should narrow the catalog to a model and nozzle', async () => {
      const catalog = await loadBambuStudioCatalog(fake.install, { model: 'X1C', nozzleDiameter: 0.4 });
      expect(names(catalog.printers)).toEqual(['Bambu Lab X1 Carbon 0.4 nozzle', 'X1C mine']);
      expect(names(catalog.processes)).toEqual([
        '0.12mm Fine @BBL X1C',
        '0.12mm High Quality @BBL X1C',
        '0.20mm Standard @BBL X1C',
        '0.20mm Strength @BBL X1C',
        '0.28mm Extra Draft @BBL X1C',
        'My Gyroid @BBL X1C',
      ]);
      expect(names(catalog.filaments)).toEqual([
        'Bambu PETG Basic @BBL X1C',
        'Bambu PETG HF @BBL X1C',
        'Bambu PLA Basic @BBL X1C',
        'Generic PETG',
        'My PETG',
      ]);
    });

    it('should narrow the catalog to a user printer through its system parent', async () => {
      const catalog = await loadBambuStudioCatalog(fake.install, { printer: 'X1C mine' });
      expect(names(catalog.printers)).toEqual(['X1C mine']);
      expect(names(catalog.processes)).toContain('0.20mm Standard @BBL X1C');
      expect(names(catalog.processes)).not.toContain('0.20mm Standard @BBL A1M');
    });
  });

  describe('selection defaults', () => {
    let catalog: BambuStudioCatalog;

    beforeAll(async () => {
      catalog = await loadBambuStudioCatalog(fake.install);
    });

    it('should match printer models by name, short name and short code', () => {
      expect(matchesPrinterModel('X1C', 'Bambu Lab X1 Carbon')).toBe(true);
      expect(matchesPrinterModel('x1 carbon', 'Bambu Lab X1 Carbon')).toBe(true);
      expect(matchesPrinterModel('A1M', 'Bambu Lab A1 mini')).toBe(true);
      expect(matchesPrinterModel('X1', 'Bambu Lab X1 Carbon')).toBe(false);
    });

    it('should pick the system presets for the model, quality, tray and plate', () => {
      expect(
        resolveBambuStudioSelection(catalog, {
          model: 'X1C',
          plate: 'high-temperature',
          materials: [
            { slot: 2, materialId: 'PETG' },
            { slot: 0, materialId: 'PETG', profileId: 'GFG02' },
          ],
        }),
      ).toEqual({
        printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
        process: '0.20mm Standard @BBL X1C',
        filaments: ['Bambu PETG HF @BBL X1C', 'Bambu PETG Basic @BBL X1C'],
        plate: 'high-temperature',
      });
    });

    it.each([
      { preset: 'fast', process: '0.28mm Extra Draft @BBL X1C' },
      { preset: 'fine', process: '0.12mm Fine @BBL X1C' },
    ] as const)('should pick the $preset process by layer height', ({ preset, process }) => {
      expect(resolveBambuStudioSelection(catalog, { model: 'X1C', preset, materials: [] }).process).toBe(process);
    });

    it('should fall back to the tray type for an unknown profile id, to PLA for an empty tray, and to the textured PEI plate', () => {
      const selection = resolveBambuStudioSelection(catalog, {
        model: 'X1C',
        materials: [{ slot: 0, materialId: 'PETG', profileId: 'GFZZZ' }],
      });
      expect(selection.filaments).toEqual(['Bambu PETG Basic @BBL X1C']);
      expect(selection.plate).toBe('textured-pei');
      expect(resolveBambuStudioSelection(catalog, { model: 'X1C', materials: [] }).filaments).toEqual([
        'Bambu PLA Basic @BBL X1C',
      ]);
    });

    it('should keep the presets the caller chose', () => {
      expect(
        resolveBambuStudioSelection(
          catalog,
          { model: 'X1C', materials: [] },
          { printer: 'X1C mine', process: 'My Gyroid @BBL X1C', settings: { wall_loops: 5 } },
        ),
      ).toEqual({
        printer: 'X1C mine',
        process: 'My Gyroid @BBL X1C',
        filaments: ['Bambu PLA Basic @BBL X1C'],
        plate: 'textured-pei',
        settings: { wall_loops: 5 },
      });
    });

    it('should refuse an unknown preset or a printer without a matching nozzle', () => {
      expect(() => resolveBambuStudioSelection(catalog, { model: 'X1C', materials: [] }, { process: 'Nope' })).toThrow(
        'Bambu Studio has no process preset "Nope".',
      );
      expect(() => resolveBambuStudioSelection(catalog, { model: 'X1C', nozzleDiameter: 0.8, materials: [] })).toThrow(
        'Bambu Studio has no printer preset for X1C with a 0.8 mm nozzle.',
      );
    });
  });

  describe('discovery', () => {
    it('should find the install TAU_BAMBU_STUDIO_PATH names and read its version once per executable change', async () => {
      const env = { TAU_BAMBU_STUDIO_PATH: fake.app, HOME: fake.home };
      // Concurrent first calls share one version probe.
      const [found] = await Promise.all([findBambuStudio({ env }), findBambuStudio({ env })]);
      expect(found).toEqual({
        executable: fake.install.executable,
        version: '09.08.07.06',
        resourcesDir: fake.install.resourcesDir,
      });
      await findBambuStudio({ env });
      const helpCount = join(fake.app, 'Contents', 'MacOS', 'help-count');
      expect(await readFile(helpCount, 'utf8')).toBe('.');
      // The version probe runs in a temporary directory, so its result.json never lands in the caller's.
      const helpCwd = await readFile(join(fake.app, 'Contents', 'MacOS', 'help-cwd'), 'utf8');
      expect(helpCwd).not.toBe(process.cwd());
      await expect(access(helpCwd)).rejects.toMatchObject({ code: 'ENOENT' });
      const later = new Date(Date.now() + 5000);
      await utimes(fake.install.executable, later, later);
      await findBambuStudio({ env });
      expect(await readFile(helpCount, 'utf8')).toBe('..');
    });

    it.runIf(process.platform === 'darwin')('should report the data directory when it exists', async () => {
      const dataDirectory = join(fake.home, 'Library', 'Application Support', 'BambuStudio');
      await mkdir(dataDirectory, { recursive: true });
      await expect(
        findBambuStudio({ env: { TAU_BAMBU_STUDIO_PATH: fake.app, HOME: fake.home } }),
      ).resolves.toMatchObject({
        dataDir: dataDirectory,
      });
    });

    it('should find nothing where the override points at no install', async () => {
      await expect(
        findBambuStudio({ env: { TAU_BAMBU_STUDIO_PATH: join(root, 'missing', 'BambuStudio.app'), HOME: fake.home } }),
      ).resolves.toBeUndefined();
    });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
