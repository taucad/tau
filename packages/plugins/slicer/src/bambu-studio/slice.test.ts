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
  stl: string;
  datadir: string[];
}>;

const selection: BambuStudioSelection = {
  printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
  process: '0.20mm Standard @BBL X1C',
  filaments: ['Bambu PETG Basic @BBL X1C', 'Bambu PLA Basic @BBL X1C'],
  plate: 'high-temperature',
};
const stl = new TextEncoder().encode('demo stl');

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
      stl,
      signal: new AbortController().signal,
    });

    expect(new TextDecoder().decode(result.archive)).toBe('demo archive bytes');
    expect(result).toMatchObject({
      version: '09.08.07.06',
      presets: { printer: selection.printer, process: selection.process, filaments: selection.filaments },
      result: { returnCode: 0, errorString: 'Success.', predictionSeconds: 61.5, weightGrams: 1.75 },
    });
    const { args, cwd, files, datadir, stl: stlBase64 } = await recorded();
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
    expect(Buffer.from(stlBase64, 'base64').toString()).toBe('demo stl');
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

  it('should apply setting overrides over the resolved presets', async () => {
    await fake.control({ mode: 'succeed' });
    await sliceWithBambuStudio({
      install: fake.install,
      selection: { ...selection, settings: { wall_loops: 4, nozzle_temperature: 262 } },
      stl,
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
      stl,
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
      stl,
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
        stl,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'BambuStudioError', code: 'BAMBU_STUDIO_SETTINGS_INVALID' });
  });

  it('should report the error string of a failed slice and remove the temporary directory', async () => {
    await fake.control({ mode: 'fail' });
    await expect(
      sliceWithBambuStudio({ install: fake.install, selection, stl, signal: new AbortController().signal }),
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
      sliceWithBambuStudio({ install: fake.install, selection, stl, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: 'BAMBU_STUDIO_SLICE_FAILED',
      message: 'Bambu Studio exited with code 3 without a result. demo crash log',
    });
  });

  it('should stop Bambu Studio when the signal aborts and still remove the temporary directory', async () => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    const controller = new AbortController();
    const slice = sliceWithBambuStudio({ install: fake.install, selection, stl, signal: controller.signal });
    // Abort once the command line has started and recorded itself.
    await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
    controller.abort();
    await expect(slice).rejects.toMatchObject({ name: 'AbortError' });
    const { pid, cwd } = await recorded();
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    expect(await gone(cwd)).toBe(true);
  });

  it('should stop Bambu Studio after five minutes', async () => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    const deadline = new AbortController();
    const sliceTimeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    try {
      const slice = sliceWithBambuStudio({
        install: fake.install,
        selection,
        stl,
        signal: new AbortController().signal,
      });
      await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
      expect(sliceTimeoutSpy).toHaveBeenCalledWith(300_000);
      deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      await expect(slice).rejects.toMatchObject({
        code: 'BAMBU_STUDIO_SLICE_FAILED',
        message: 'Bambu Studio did not finish slicing within 5 minutes.',
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
      sliceWithBambuStudio({ install: fake.install, selection, stl, signal: new AbortController().signal }),
      sliceWithBambuStudio({ install: fake.install, selection, stl, signal: new AbortController().signal }),
    ]);
    expect(await readFile(fake.log, 'utf8')).toBe('start\nend\nstart\nend\n');
  });

  it('should reject a slice cancelled while it waits behind another without waiting for it', async () => {
    await fake.control({ mode: 'hang' });
    await rm(fake.record, { force: true });
    const running = new AbortController();
    const first = sliceWithBambuStudio({ install: fake.install, selection, stl, signal: running.signal });
    await vi.waitFor(async () => access(fake.record), { timeout: 10_000, interval: 25 });
    const waiting = new AbortController();
    const second = sliceWithBambuStudio({ install: fake.install, selection, stl, signal: waiting.signal });
    waiting.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    running.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
