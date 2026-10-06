/**
 * A synthetic Bambu Studio install for tests: made-up presets shaped like
 * Bambu Studio's (vendor index, `inherits`, `include`, user presets) and a
 * small Node script standing in for the command line.
 *
 * @module
 */

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BambuStudioInstallation } from '#bambu-studio/types.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio preset and result keys are fixed snake_case names. */

type Presets = Record<string, Record<string, unknown>>;

const x1c = 'Bambu Lab X1 Carbon 0.4 nozzle';
const a1m = 'Bambu Lab A1 mini 0.4 nozzle';

const machines = (origin: string): Presets => ({
  'demo machine base': {
    type: 'machine',
    instantiation: 'false',
    origin,
    retraction_length: ['1'],
    start_note: 'base',
  },
  'demo x1c start template': { instantiation: 'false', start_note: 'template', end_note: 'template' },
  [x1c]: {
    type: 'machine',
    inherits: 'demo machine base',
    include: ['demo x1c start template'],
    instantiation: 'true',
    setting_id: 'DM1',
    printer_model: 'Bambu Lab X1 Carbon',
    nozzle_diameter: ['0.4'],
    end_note: 'own',
  },
  'Bambu Lab X1 Carbon 0.6 nozzle': {
    type: 'machine',
    inherits: 'demo machine base',
    instantiation: 'true',
    printer_model: 'Bambu Lab X1 Carbon',
    nozzle_diameter: ['0.6'],
  },
  [a1m]: {
    type: 'machine',
    inherits: 'demo machine base',
    instantiation: 'true',
    printer_model: 'Bambu Lab A1 mini',
    nozzle_diameter: ['0.4'],
    printable_area: ['0x0', '180x0', '180x180', '0x180'],
  },
});

const processes = (origin: string): Presets => ({
  'demo process base': { type: 'process', instantiation: 'false', origin, layer_height: '0.2', wall_loops: '2' },
  '0.20mm Standard @BBL X1C': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    compatible_printers: [x1c],
  },
  '0.20mm Strength @BBL X1C': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    wall_loops: '6',
    compatible_printers: [x1c],
  },
  '0.28mm Extra Draft @BBL X1C': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    layer_height: '0.28',
    compatible_printers: [x1c],
  },
  '0.12mm High Quality @BBL X1C': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    layer_height: '0.12',
    compatible_printers: [x1c],
  },
  '0.12mm Fine @BBL X1C': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    layer_height: '0.12',
    compatible_printers: [x1c],
  },
  '0.20mm Standard @BBL A1M': {
    type: 'process',
    inherits: 'demo process base',
    instantiation: 'true',
    compatible_printers: [a1m],
  },
});

const filaments = (origin: string): Presets => ({
  'demo filament base': {
    type: 'filament',
    instantiation: 'false',
    origin,
    filament_type: ['PLA'],
    nozzle_temperature: ['200'],
    note_a: 'base',
    note_b: 'base',
  },
  'demo dual template': { instantiation: 'false', note_a: 'template', note_b: 'template' },
  'Bambu PETG Basic @base': {
    type: 'filament',
    inherits: 'demo filament base',
    instantiation: 'false',
    filament_type: ['PETG'],
    filament_id: 'GFG00',
    nozzle_temperature: ['250'],
    demo_petg_only: ['5'],
  },
  'Bambu PETG Basic @BBL X1C': {
    type: 'filament',
    inherits: 'Bambu PETG Basic @base',
    include: ['demo dual template'],
    instantiation: 'true',
    compatible_printers: [x1c],
    note_b: 'own',
  },
  'Bambu PETG Basic @BBL A1M': {
    type: 'filament',
    inherits: 'Bambu PETG Basic @base',
    instantiation: 'true',
    compatible_printers: [a1m],
  },
  'Generic PETG': {
    type: 'filament',
    inherits: 'demo filament base',
    instantiation: 'true',
    filament_type: ['PETG'],
    filament_id: 'GFG99',
    compatible_printers: [x1c],
  },
  'Bambu PETG HF @BBL X1C': {
    type: 'filament',
    inherits: 'demo filament base',
    instantiation: 'true',
    filament_type: ['PETG'],
    filament_id: 'GFG02',
    compatible_printers: [x1c],
  },
  'Bambu PLA Basic @BBL X1C': {
    type: 'filament',
    inherits: 'demo filament base',
    instantiation: 'true',
    filament_id: 'GFA00',
    compatible_printers: [x1c],
  },
});

const userPresets: Record<'machine' | 'process' | 'filament', Presets> = {
  machine: { 'X1C mine': { name: 'X1C mine', from: 'User', inherits: x1c, retraction_length: ['0.6'] } },
  process: {
    'My Gyroid @BBL X1C': {
      name: 'My Gyroid @BBL X1C',
      from: 'User',
      inherits: '0.20mm Standard @BBL X1C',
      wall_loops: '4',
    },
  },
  filament: {
    'My PETG': { name: 'My PETG', from: 'User', inherits: 'Bambu PETG Basic @BBL X1C', nozzle_temperature: ['245'] },
    Orphan: { name: 'Orphan', from: 'User', inherits: 'A preset that does not exist' },
  },
};

const writeVendor = async (root: string, version: string, origin: string): Promise<void> => {
  const kinds = { machine: machines(origin), process: processes(origin), filament: filaments(origin) };
  await Promise.all(Object.keys(kinds).map(async (kind) => mkdir(join(root, 'BBL', kind), { recursive: true })));
  await Promise.all(
    Object.entries(kinds).flatMap(([kind, presets]) =>
      Object.entries(presets).map(async ([name, values]) =>
        writeFile(join(root, 'BBL', kind, `${name}.json`), JSON.stringify({ name, ...values })),
      ),
    ),
  );
  const lists = Object.fromEntries(
    Object.entries(kinds).map(([kind, presets]) => [
      `${kind}_list`,
      Object.keys(presets).map((name) => ({ name, sub_path: `${kind}/${name}.json` })),
    ]),
  );
  await writeFile(join(root, 'BBL.json'), JSON.stringify({ name: 'Demo', version, ...lists }));
};

/**
 * Stand-in for the Bambu Studio command line. `--help` prints a version and
 * counts itself; a slice records its arguments, working directory, loaded
 * presets and part STLs, then behaves as `control.json` next to it says.
 */
const fakeCommandLine = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--help') {
  fs.appendFileSync(path.join(__dirname, 'help-count'), '.');
  // Like the real command line, a help run leaves result.json in its working directory.
  fs.writeFileSync('result.json', '{}');
  fs.writeFileSync(path.join(__dirname, 'help-cwd'), process.cwd());
  process.stderr.write('[trace] starting\\n');
  process.stdout.write('BambuStudio-09.08.07.06:\\nUsage: demo\\n');
  process.exit(1);
}
const control = JSON.parse(fs.readFileSync(path.join(__dirname, 'control.json'), 'utf8'));
const option = (name) => args[args.indexOf(name) + 1];
const files = {};
for (const file of [...option('--load-settings').split(';'), ...option('--load-filaments').split(';')]) {
  files[file] = JSON.parse(fs.readFileSync(file, 'utf8'));
}
fs.appendFileSync(control.log, 'start\\n');
const record = JSON.stringify({
  args, cwd: process.cwd(), pid: process.pid, files,
  stls: args.filter((arg) => arg.endsWith('.stl')).map((file) => fs.readFileSync(file).toString('base64')),
  datadir: fs.readdirSync(option('--datadir')),
});
// Write then rename: a test that waits for the record to exist can kill this process mid-write.
fs.writeFileSync(control.record + '.tmp', record);
fs.renameSync(control.record + '.tmp', control.record);
fs.appendFileSync(control.runs, record + '\\n');
const out = option('--outputdir');
const finish = () => {
  fs.appendFileSync(control.log, 'end\\n');
  // Like Bambu Studio on a crowded multi-colour plate: the arranged slice fails its path-conflict check,
  // a slice without checks exports the measured plate, and a slice that keeps the placement succeeds.
  if (control.mode === 'tower-conflict' && args.includes('--no-check')) {
    fs.writeFileSync(path.join(out, option('--export-3mf')), Buffer.from(control.measurement, 'base64'));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ return_code: 0, error_string: 'Success.' }));
    process.exit(0);
  }
  if (control.mode === 'tower-conflict' && option('--arrange') === '1') {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ return_code: -101, error_string: ' G-code conflicts detected after slicing.' }));
    process.exit(155);
  }
  if (control.mode === 'fail') {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ return_code: -50, error_string: 'Nothing to slice here.' }));
    process.exit(206);
  }
  if (control.mode === 'crash') {
    process.stderr.write('demo crash log');
    process.exit(3);
  }
  fs.writeFileSync(path.join(out, option('--export-3mf')), 'demo archive bytes');
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({
    return_code: 0,
    error_string: 'Success.',
    sliced_plates: [{ total_predication: 61.5, filaments: [{ total_used_g: 1.25 }, { total_used_g: 0.5 }] }],
  }));
};
if (control.mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  setTimeout(finish, control.finishDelay ?? 0);
}
`;

/** Where the fake install lives and how to steer its command line. */
export type FakeInstall = Readonly<{
  install: BambuStudioInstallation;
  /** The `.app` directory, for `TAU_BAMBU_STUDIO_PATH`. */
  app: string;
  /** Home directory whose data directory holds the OTA and user presets. */
  home: string;
  /**
   * `finishDelay` is milliseconds before a succeeding slice writes its output. `tower-conflict` fails the
   * arranged slice with Bambu Studio's path-conflict code and exports `measurement` (base64) when checks are off.
   */
  control: (options: {
    mode: 'succeed' | 'fail' | 'crash' | 'hang' | 'tower-conflict';
    finishDelay?: number;
    measurement?: string;
  }) => Promise<void>;
  /** The last slice's arguments, files and STLs. */
  record: string;
  /** Every slice's record, one JSON line each. */
  runs: string;
  log: string;
}>;

/**
 * Write a fake install under `root`.
 *
 * @param root - Empty temporary directory.
 * @param options - Bundled and OTA vendor versions; OTA presets and user presets are written only when asked.
 * @returns The install and its control files.
 */
export const writeFakeInstall = async (
  root: string,
  options: Readonly<{ bundledVersion: string; systemVersion?: string; user?: boolean }>,
): Promise<FakeInstall> => {
  const app = join(root, 'BambuStudio.app');
  const executable = join(app, 'Contents', 'MacOS', 'BambuStudio');
  const resourcesDirectory = join(app, 'Contents', 'Resources');
  const home = join(root, 'home');
  const dataDirectory = join(root, 'data');
  await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(executable, fakeCommandLine);
  await chmod(executable, 0o755);
  await writeVendor(join(resourcesDirectory, 'profiles'), options.bundledVersion, 'bundled');
  await mkdir(home, { recursive: true });
  await mkdir(dataDirectory, { recursive: true });
  if (options.systemVersion !== undefined) {
    await writeVendor(join(dataDirectory, 'system'), options.systemVersion, 'system');
  }
  if (options.user) {
    await Promise.all(
      Object.entries(userPresets).map(async ([kind, presets]) => {
        await mkdir(join(dataDirectory, 'user', '42', kind), { recursive: true });
        await Promise.all(
          Object.entries(presets).map(async ([name, values]) =>
            writeFile(join(dataDirectory, 'user', '42', kind, `${name}.json`), JSON.stringify(values)),
          ),
        );
      }),
    );
  }
  const record = join(root, 'record.json');
  const log = join(root, 'log.txt');
  const runs = join(root, 'runs.jsonl');
  return {
    install: { executable, version: '09.08.07.06', resourcesDir: resourcesDirectory, dataDir: dataDirectory },
    app,
    home,
    record,
    runs,
    log,
    control: async (control) =>
      writeFile(join(app, 'Contents', 'MacOS', 'control.json'), JSON.stringify({ ...control, record, runs, log })),
  };
};
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
