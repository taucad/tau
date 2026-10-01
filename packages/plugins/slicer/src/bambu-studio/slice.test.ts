import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { writeFakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import type { FakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import { sliceWithBambuStudio } from '#bambu-studio/slice.js';
import type { BambuStudioSelection } from '#bambu-studio/types.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio preset and result keys are fixed snake_case names. */

type Recorded = Readonly<{
  args: string[];
  cwd: string;
  pid: number;
  files: Record<string, Record<string, unknown>>;
  /** Base64 of each STL argument, in order. */
  stls: string[];
  datadir: string[];
}>;

const selection: BambuStudioSelection = {
  printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
  process: '0.20mm Standard @BBL X1C',
  filaments: ['Bambu PETG Basic @BBL X1C', 'Bambu PLA Basic @BBL X1C'],
  plate: 'high-temperature',
};
const stl = new TextEncoder().encode('demo stl');
const parts = [{ stl }];
const text = (base64: string): string => Buffer.from(base64, 'base64').toString();

const gone = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
};

describe('sliceWithBambuStudio', () => {
  let root: string;
  let fake: FakeInstall;
  const recorded = async (): Promise<Recorded> => JSON.parse(await readFile(fake.record, 'utf8')) as Recorded;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-bambu-slice-'));
    fake = await writeFakeInstall(root, { bundledVersion: '01.00.00.01', user: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('should run the command line on flattened presets in a temporary directory and return its archive untouched', async () => {
    await fake.control({ mode: 'succeed' });
    const result = await sliceWithBambuStudio({
      install: fake.install,
      selection,
      parts,
      signal: new AbortController().signal,
    });

    expect(new TextDecoder().decode(result.archive)).toBe('demo archive bytes');
    expect(result).toMatchObject({
      version: '09.08.07.06',
      presets: { printer: selection.printer, process: selection.process, filaments: selection.filaments },
      result: { returnCode: 0, errorString: 'Success.', predictionSeconds: 61.5, weightGrams: 1.75 },
    });
    const { args, cwd, files, datadir, stls } = await recorded();
    expect(args).toEqual([
      '--datadir',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]datadir$/u),
      '--slice',
      '0',
      '--arrange',
      '1',
      '--curr-bed-type',
      'High Temp Plate',
      '--load-settings',
      'machine.json;process.json',
      '--load-filaments',
      'filament-1.json;filament-2.json',
      '--outputdir',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]out$/u),
      '--export-3mf',
      'model.gcode.3mf',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]model\.stl$/u),
    ]);
    expect(datadir).toEqual([]);
    expect(stls.map((stl) => text(stl))).toEqual(['demo stl']);
    expect(files['machine.json']).toMatchObject({
      name: 'Bambu Lab X1 Carbon 0.4 nozzle',
      from: 'system',
      instantiation: 'true',
      start_note: 'template',
      end_note: 'own',
    });
    expect(files['filament-1.json']).toMatchObject({ name: 'Bambu PETG Basic @BBL X1C', filament_id: 'GFG00' });
    expect(files['filament-2.json']).toMatchObject({ name: 'Bambu PLA Basic @BBL X1C', filament_id: 'GFA00' });
    for (const values of Object.values(files)) {
      expect(values).not.toHaveProperty('inherits');
      expect(values).not.toHaveProperty('include');
    }
    expect(await gone(cwd)).toBe(true);
  });

  it('should slice one coloured part with the single-part arguments plus its colour', async () => {
    await fake.control({ mode: 'succeed' });
    await sliceWithBambuStudio({
      install: fake.install,
      selection,
      parts: [{ stl, color: '#F5A623' }],
      signal: new AbortController().signal,
    });
    const { args } = await recorded();
    expect(args.slice(args.indexOf('--load-filaments'), args.indexOf('--outputdir'))).toEqual([
      '--load-filaments',
      'filament-1.json;filament-2.json',
      '--filament-colour',
      '#F5A623',
    ]);
  });

  it('should slice several parts as one assembly, part i printed with filament i in its colour', async () => {
    await fake.control({ mode: 'succeed' });
    const encoder = new TextEncoder();
    const result = await sliceWithBambuStudio({
      install: fake.install,
      selection,
      parts: [{ stl: encoder.encode('red part'), color: '#FF0000' }, { stl: encoder.encode('uncoloured part') }],
      signal: new AbortController().signal,
    });
    const { args, files, stls } = await recorded();
    expect(args).toEqual([
      '--datadir',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]datadir$/u),
      '--slice',
      '0',
      '--arrange',
      '1',
      '--curr-bed-type',
      'High Temp Plate',
      '--load-settings',
      'machine.json;process.json',
      '--load-filaments',
      'filament-1.json;filament-2.json',
      '--load-filament-ids',
      '1,2',
      '--assemble',
      // An uncoloured part keeps its place in the list; Bambu Studio fills its own default colour.
      '--filament-colour',
      '#FF0000;',
      '--outputdir',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]out$/u),
      '--export-3mf',
      'model.gcode.3mf',
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]part-1\.stl$/u),
      expect.stringMatching(/tau-bambu-studio-\w+[/\\]part-2\.stl$/u),
    ]);
    expect(stls.map((stl) => text(stl))).toEqual(['red part', 'uncoloured part']);
    expect(files['filament-1.json']).toMatchObject({ name: 'Bambu PETG Basic @BBL X1C' });
    expect(files['filament-2.json']).toMatchObject({ name: 'Bambu PLA Basic @BBL X1C' });
    expect(result.presets.filaments).toEqual(selection.filaments);
  });

  it('should print parts the presets do not reach with the first preset', async () => {
    await fake.control({ mode: 'succeed' });
    const result = await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, filaments: ['Bambu PETG Basic @BBL X1C'] },
      parts: [
        { stl, color: '#FF0000' },
        { stl, color: '#00FF00' },
        { stl, color: '#0000FF' },
      ],
      signal: new AbortController().signal,
    });
    const { args, files } = await recorded();
    expect(args[args.indexOf('--load-filaments') + 1]).toBe('filament-1.json;filament-2.json;filament-3.json');
    expect(args[args.indexOf('--load-filament-ids') + 1]).toBe('1,2,3');
    expect(args[args.indexOf('--filament-colour') + 1]).toBe('#FF0000;#00FF00;#0000FF');
    expect(result.presets.filaments).toEqual(Array.from({ length: 3 }, () => 'Bambu PETG Basic @BBL X1C'));
    for (const file of ['filament-1.json', 'filament-2.json', 'filament-3.json']) {
      expect(files[file]).toMatchObject({ name: 'Bambu PETG Basic @BBL X1C', filament_id: 'GFG00' });
    }
  });

  it('should load one preset per part when the selection names more', async () => {
    await fake.control({ mode: 'succeed' });
    const result = await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, filaments: [...selection.filaments, 'Bambu PETG HF @BBL X1C'] },
      parts: [{ stl }, { stl }],
      signal: new AbortController().signal,
    });
    const { files } = await recorded();
    expect(Object.keys(files)).toEqual(['machine.json', 'process.json', 'filament-1.json', 'filament-2.json']);
    expect(result.presets.filaments).toEqual(selection.filaments);
  });

  it('should refuse a colour that is not #RRGGBB before running Bambu Studio', async () => {
    await fake.control({ mode: 'succeed' });
    await rm(fake.record, { force: true });
    await expect(
      sliceWithBambuStudio({
        install: fake.install,
        selection,
        parts: [{ stl, color: '#F5A623;#FFFFFF' }],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: 'BambuStudioError',
      code: 'BAMBU_STUDIO_SETTINGS_INVALID',
      message: 'The filament colour "#F5A623;#FFFFFF" is not #RRGGBB.',
    });
    expect(await gone(fake.record)).toBe(true);
  });

  it('should refuse a slice without parts', async () => {
    await expect(
      sliceWithBambuStudio({ install: fake.install, selection, parts: [], signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: 'BambuStudioError',
      code: 'BAMBU_STUDIO_SLICE_FAILED',
      message: 'A slice needs at least one part.',
    });
  });

  it('should apply setting overrides over the resolved presets', async () => {
    await fake.control({ mode: 'succeed' });
    await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, settings: { wall_loops: 4, nozzle_temperature: 262 } },
      parts,
      signal: new AbortController().signal,
    });
    const { files } = await recorded();
    expect(files['process.json']).toMatchObject({ wall_loops: '4' });
    expect(files['filament-1.json']).toMatchObject({ nozzle_temperature: ['262'] });
    expect(files['filament-2.json']).toMatchObject({ nozzle_temperature: ['262'] });
  });

  it('should apply a filament setting only to the used filaments whose preset has it', async () => {
    await fake.control({ mode: 'succeed' });
    await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, settings: { demo_petg_only: 7 } },
      parts,
      signal: new AbortController().signal,
    });
    const { files } = await recorded();
    expect(files['filament-1.json']).toMatchObject({ demo_petg_only: ['7'] });
    expect(files['filament-2.json']).not.toHaveProperty('demo_petg_only');
  });

  it('should list a user printer as compatible with the process and filament presets it inherits', async () => {
    await fake.control({ mode: 'succeed' });
    await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, printer: 'X1C mine', process: 'My Gyroid @BBL X1C', filaments: ['My PETG'] },
      parts,
      signal: new AbortController().signal,
    });
    const { files } = await recorded();
    expect(files['machine.json']).toMatchObject({
      name: 'X1C mine',
      retraction_length: ['0.6'],
      start_note: 'template',
    });
    expect(files['process.json']).toMatchObject({
      name: 'My Gyroid @BBL X1C',
      wall_loops: '4',
      compatible_printers: ['Bambu Lab X1 Carbon 0.4 nozzle', 'X1C mine'],
    });
    expect(files['filament-1.json']).toMatchObject({
      name: 'My PETG',
      from: 'system',
      compatible_printers: ['Bambu Lab X1 Carbon 0.4 nozzle', 'X1C mine'],
    });
  });

  it('should refuse an unknown setting before running Bambu Studio', async () => {
    await expect(
      sliceWithBambuStudio({
        install: fake.install,
        selection: { ...selection, settings: { not_a_bambu_setting: 1 } },
        parts,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'BambuStudioError', code: 'BAMBU_STUDIO_SETTINGS_INVALID' });
  });

  it('should report the error string of a failed slice and remove the temporary directory', async () => {
    await fake.control({ mode: 'fail' });
    await expect(
      sliceWithBambuStudio({ install: fake.install, selection, parts, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: 'BambuStudioError',
      code: 'BAMBU_STUDIO_SLICE_FAILED',
      message: 'Bambu Studio could not slice: Nothing to slice here.',
    });
    const { cwd } = await recorded();
    expect(await gone(cwd)).toBe(true);
  });

  it('should report the exit code and log tail when Bambu Studio writes no result', async () => {
    await fake.control({ mode: 'crash' });
    await expect(
      sliceWithBambuStudio({ install: fake.install, selection, parts, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: 'BAMBU_STUDIO_SLICE_FAILED',
      message: 'Bambu Studio exited with code 3 without a result. demo crash log',
    });
  });

  it('should stop Bambu Studio when the signal aborts and still remove the temporary directory', async () => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    const controller = new AbortController();
    const slice = sliceWithBambuStudio({ install: fake.install, selection, parts, signal: controller.signal });
    // Abort once the command line has started and recorded itself.
    await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
    controller.abort();
    await expect(slice).rejects.toMatchObject({ name: 'AbortError' });
    const { pid, cwd } = await recorded();
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    expect(await gone(cwd)).toBe(true);
  });

  it.each([
    { size: 'a small model', stls: [stl], sliceTimeout: 120_000, within: '2 minutes' },
    {
      size: 'two parts of 1 MiB',
      stls: [new Uint8Array(2 ** 20), new Uint8Array(2 ** 20)],
      sliceTimeout: 240_000,
      within: '4 minutes',
    },
  ])('should stop a hung Bambu Studio after $within for $size', async ({ stls, sliceTimeout, within }) => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    const deadline = new AbortController();
    const sliceTimeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    try {
      const slice = sliceWithBambuStudio({
        install: fake.install,
        selection,
        parts: stls.map((part) => ({ stl: part })),
        signal: new AbortController().signal,
      });
      await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
      expect(sliceTimeoutSpy).toHaveBeenCalledWith(sliceTimeout);
      deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      await expect(slice).rejects.toMatchObject({
        name: 'BambuStudioError',
        code: 'BAMBU_STUDIO_TIMEOUT',
        message:
          `Bambu Studio did not finish slicing within ${within} and was stopped. ` +
          'Slice again; if it stops again, lower the model’s mesh resolution or close other busy apps first.',
      });
    } finally {
      sliceTimeoutSpy.mockRestore();
    }
    const { pid, cwd } = await recorded();
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    expect(await gone(cwd)).toBe(true);
  });

  it('should run one slice at a time', async () => {
    await fake.control({ mode: 'succeed', finishDelay: 150 });
    await rm(fake.log, { force: true });
    await Promise.all([
      sliceWithBambuStudio({ install: fake.install, selection, parts, signal: new AbortController().signal }),
      sliceWithBambuStudio({ install: fake.install, selection, parts, signal: new AbortController().signal }),
    ]);
    expect(await readFile(fake.log, 'utf8')).toBe('start\nend\nstart\nend\n');
  });

  it('should reject a slice cancelled while it waits behind another without waiting for it', async () => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    await rm(fake.log, { force: true });
    const running = new AbortController();
    const first = sliceWithBambuStudio({ install: fake.install, selection, parts, signal: running.signal });
    await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
    const waiting = new AbortController();
    const second = sliceWithBambuStudio({ install: fake.install, selection, parts, signal: waiting.signal });
    waiting.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    const thirdController = new AbortController();
    const third = sliceWithBambuStudio({ install: fake.install, selection, parts, signal: thirdController.signal });
    let thirdSettled = false;
    // oxlint-disable-next-line promise/prefer-await-to-then -- Observe queued settlement without waiting for the running slice.
    const observed = third.catch((error: unknown) => {
      thirdSettled = true;
      throw error;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(thirdSettled).toBe(false);
    expect(await readFile(fake.log, 'utf8')).toBe('start\n');
    thirdController.abort();
    await expect(observed).rejects.toMatchObject({ name: 'AbortError' });
    running.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
