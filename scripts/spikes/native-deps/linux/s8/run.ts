/**
 * Spike S8 runner: one controlled download each of a small pure wheel and a wheel with `.data/`,
 * the `readWheel` prototype against them and against synthesized variants, and a central-directory
 * survey (HTTP range reads, bytes parsed as data) of the build123d closure's linux-x64 wheels.
 * Usage: node scripts/spikes/native-deps/linux/s8/run.ts <work-dir> [--no-survey]
 * Exit codes: 0 every expectation met, 1 otherwise, 2 usage. JSON report on stdout.
 */

/* oxlint-disable no-restricted-imports -- spike modules sit outside scripts/src, so the #* import map cannot name them. */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { WheelError, isSymlink, readWheel } from './read-wheel.ts';
import type { Wheel } from './read-wheel.ts';
import { writeZip } from './zip-writer.ts';
import type { ZipInput } from './zip-writer.ts';
import { lockedPackages, readCentralDirectory, selectWheel } from './survey.ts';

type Attempt =
  | {
      outcome: 'verified';
      distributionInfo: string;
      files: number;
      directories: number;
      recordRows: number;
      unhashed: string[];
      zip64: boolean;
      methods: Record<string, number>;
    }
  | { outcome: 'refused'; code: string; detail: Readonly<Record<string, unknown>> }
  | { outcome: 'crash'; message: string };
type Expected = { outcome: Attempt['outcome']; code?: string; feature?: string };
type WheelFile = Wheel['files'][number] | { path: string; data: Uint8Array<ArrayBuffer> };

const [work, flag] = process.argv.slice(2);
if (work === undefined) {
  process.stderr.write('Usage: run.ts <work-dir> [--no-survey]\n');
  process.exit(2);
}
const downloads = join(work, 'downloads');
mkdirSync(downloads, { recursive: true });

// Pinned by PyPI's published sha256 (pypi.org/pypi/<name>/<version>/json), checked before parsing.
const pinned = {
  pure: {
    file: 'six-1.17.0-py2.py3-none-any.whl',
    sha256: '4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274',
    url: 'https://files.pythonhosted.org/packages/b7/ce/149a00dd41f10bc29e5921b496af8b574d8413afcd5e30dfa0ed46c2cc5e/six-1.17.0-py2.py3-none-any.whl',
  },
  data: {
    file: 'ipykernel-6.29.5-py3-none-any.whl',
    sha256: 'afdb66ba5aa354b09b91379bac28ae4afebbb30e8b39510c9690afb7a10421b5',
    url: 'https://files.pythonhosted.org/packages/94/5c/368ae6c01c7628438358e6d337c19b05425727fbb221d2a3c4303c372f42/ipykernel-6.29.5-py3-none-any.whl',
  },
};

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const download = async (wheel: { file: string; sha256: string; url: string }): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetch(wheel.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} for ${wheel.url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== wheel.sha256) {
    throw new Error(`sha256 mismatch for ${wheel.file}`);
  }
  writeFileSync(join(downloads, wheel.file), bytes);
  return bytes;
};

const attempt = (bytes: Uint8Array<ArrayBuffer>): Attempt => {
  try {
    const wheel = readWheel(bytes);
    return {
      outcome: 'verified',
      distributionInfo: wheel.distributionInfo,
      files: wheel.files.length,
      directories: wheel.directories,
      recordRows: wheel.record.rows,
      unhashed: wheel.record.unhashed,
      zip64: wheel.zip64,
      methods: wheel.methods,
    };
  } catch (error) {
    if (error instanceof WheelError) {
      return { outcome: 'refused', code: error.code, detail: error.detail };
    }
    return { outcome: 'crash', message: String(error) };
  }
};

const cases: Array<{ id: string; description: string; expected: Expected; result: Attempt; pass: boolean }> = [];
const expect = ([id, description]: [string, string], result: Attempt, expected: Expected): void => {
  const pass =
    result.outcome === expected.outcome &&
    (expected.code === undefined || (result.outcome === 'refused' && result.code === expected.code)) &&
    (expected.feature === undefined || (result.outcome === 'refused' && result.detail['feature'] === expected.feature));
  cases.push({ id, description, expected, result, pass });
};

const pureBytes = await download(pinned.pure);
const dataBytes = await download(pinned.data);
expect(['real-pure', `${pinned.pure.file}: RECORD verified`], attempt(pureBytes), { outcome: 'verified' });
expect(['real-data', `${pinned.data.file}: .data/ refused typed`], attempt(dataBytes), {
  outcome: 'refused',
  code: 'WHEEL_UNSUPPORTED_FEATURE',
  feature: 'data-directory',
});

// Synthesized variants built from the pure wheel's verified members.
const base = readWheel(pureBytes);
const recordPath = `${base.distributionInfo}/RECORD`;
const encoder = new TextEncoder();
const csvField = (value: string): string => (/[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const withRecord = (files: readonly WheelFile[]): WheelFile[] => {
  const rows = files
    .filter((file) => file.path !== recordPath)
    .map((file) => [
      file.path,
      `sha256=${createHash('sha256').update(file.data).digest('base64url')}`,
      String(file.data.byteLength),
    ]);
  rows.push([recordPath, '', '']);
  const record = encoder.encode(`${rows.map((row) => row.map((field) => csvField(field)).join(',')).join('\r\n')}\r\n`);
  return [...files.filter((file) => file.path !== recordPath), { path: recordPath, data: record }];
};
const directoriesOf = (files: readonly WheelFile[]): string[] => [
  ...new Set(
    files.flatMap((file) => {
      const parts = file.path.split('/').slice(0, -1);
      return parts.map((_, index) => `${parts.slice(0, index + 1).join('/')}/`);
    }),
  ),
];
const toEntries = (files: readonly WheelFile[]): ZipInput[] =>
  files.map((file, index) => ({ name: file.path, data: file.data, method: index % 2 === 0 ? 0 : 8 }));

const kitchen = withRecord([
  ...base.files,
  { path: 'six_spike/name, with "quotes" and comma.txt', data: encoder.encode('rfc4180\n') },
]);
const kitchenWithJws = [
  ...kitchen,
  { path: `${base.distributionInfo}/RECORD.jws`, data: encoder.encode('{"signatures":[]}') },
];
expect(
  [
    'synthetic-kitchen-sink',
    'stored+deflate mix, directory entries, ZIP64 extras and ZIP64 EOCD, a quoted RFC 4180 RECORD row, CRLF RECORD, RECORD.jws present',
  ],
  attempt(
    writeZip([...directoriesOf(kitchenWithJws).map((name) => ({ name })), ...toEntries(kitchenWithJws)], {
      zip64: true,
    }),
  ),
  { outcome: 'verified' },
);
const tampered = kitchen.map((file) =>
  file.path === 'six.py'
    ? { ...file, data: Uint8Array.from(file.data, (byte, index) => (index === 0 ? (byte + 1) % 256 : byte)) }
    : file,
);
expect(['negative-tampered', 'one byte flipped in six.py'], attempt(writeZip(toEntries(tampered))), {
  outcome: 'refused',
  code: 'RECORD_HASH_MISMATCH',
});
expect(
  ['negative-missing-row', 'a member with no RECORD row'],
  attempt(writeZip(toEntries([...kitchen, { path: 'six_spike/unlisted.py', data: new Uint8Array([1]) }]))),
  { outcome: 'refused', code: 'RECORD_MISSING_ROW' },
);
expect(
  ['negative-escape', 'a ../ member'],
  attempt(writeZip(toEntries([...kitchen, { path: '../evil.py', data: new Uint8Array([1]) }]))),
  { outcome: 'refused', code: 'WHEEL_UNSAFE_PATH' },
);
expect(
  ['negative-method', 'compression method 12 (bzip2)'],
  attempt(
    writeZip(
      toEntries(kitchen).map((entry, index) =>
        index === 0 ? ({ ...entry, method: 0, labelMethod: 12 } satisfies ZipInput) : entry,
      ),
    ),
  ),
  { outcome: 'refused', code: 'WHEEL_UNSUPPORTED_FEATURE', feature: 'compression-method-12' },
);
expect(
  ['negative-symlink', 'a symlink member'],
  attempt(
    writeZip([
      ...toEntries(kitchen),
      { name: 'six_spike/link', data: encoder.encode('six.py'), method: 0, mode: 0xa1_ff },
    ]),
  ),
  { outcome: 'refused', code: 'WHEEL_UNSUPPORTED_FEATURE', feature: 'symlink' },
);
const hashedRecord = kitchen.map((file) =>
  file.path === recordPath
    ? {
        ...file,
        data: encoder.encode(
          new TextDecoder().decode(file.data).replace(`${recordPath},,`, `${recordPath},sha256=${'A'.repeat(43)},1`),
        ),
      }
    : file,
);
expect(['negative-hashed-record', 'RECORD listing a hash for itself'], attempt(writeZip(toEntries(hashedRecord))), {
  outcome: 'refused',
  code: 'RECORD_INVALID',
});

// Closure survey: the central directory of every linux-x64 wheel the build123d lock pins.
const linuxX64 = (filename: string): boolean =>
  /-(?:py3|py2\.py3|cp3\d+)-(?:none|cp313|abi3)-(?:any|manylinux[^-]*x86_64(?:\.manylinux[^-]*x86_64)*)\.whl$/u.test(
    filename,
  );
const survey: Array<Record<string, unknown> & { wheel: string | undefined }> = [];
if (flag !== '--no-survey') {
  for (const item of lockedPackages()) {
    // oxlint-disable-next-line no-await-in-loop -- sequential, polite metadata reads.
    const chosen = await selectWheel(item, linuxX64, [/cp313-cp313/u, /abi3/u]);
    if (chosen === undefined) {
      survey.push({
        package: `${item.name}==${item.version}`,
        wheel: undefined,
        note: 'no linux-x64 wheel among the locked hashes',
      });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one or two range reads per wheel.
    const { end, entries } = await readCentralDirectory(chosen);
    const files = entries.filter((entry) => !entry.name.endsWith('/'));
    const methods: Record<string, number> = {};
    for (const entry of files) {
      methods[String(entry.method)] = (methods[String(entry.method)] ?? 0) + 1;
    }
    const data = entries.filter((entry) => (entry.name.split('/')[0] ?? '').endsWith('.data'));
    survey.push({
      package: `${item.name}==${item.version}`,
      wheel: chosen.filename,
      bytes: chosen.size,
      entries: entries.length,
      directories: entries.length - files.length,
      methods,
      zip64: end.zip64 || entries.some((entry) => entry.zip64Extra),
      dataEntries: data.length,
      dataSchemes: [...new Set(data.map((entry) => entry.name.split('/')[1] ?? ''))],
      dataPaths: data.map((entry) => entry.name).slice(0, 10),
      symlinks: entries.filter((entry) => isSymlink(entry)).length,
      signatures: entries.filter((entry) => /\/RECORD\.(?:jws|p7s)$/u.test(entry.name)).map((entry) => entry.name),
      encrypted: entries.filter((entry) => entry.flags % 2 === 1).length,
      maxPathLength: Math.max(...entries.map((entry) => entry.name.length)),
    });
  }
}

const surveyed = survey.filter((row) => row.wheel !== undefined);
const listWhere = (predicate: (row: Record<string, unknown>) => boolean): unknown[] =>
  surveyed.filter((row) => predicate(row)).map((row) => row.wheel);
const totals = {
  wheels: surveyed.length,
  bytes: surveyed.reduce((sum, row) => sum + Number(row['bytes']), 0),
  entries: surveyed.reduce((sum, row) => sum + Number(row['entries']), 0),
  withDataDirectory: surveyed
    .filter((row) => Number(row['dataEntries']) > 0)
    .map((row) => ({ wheel: row.wheel, schemes: row['dataSchemes'], paths: row['dataPaths'] })),
  withoutLinuxX64Wheel: survey.filter((row) => row.wheel === undefined).map((row) => row['package']),
  withZip64: listWhere((row) => row['zip64'] === true),
  withDirectoryEntries: listWhere((row) => Number(row['directories']) > 0),
  withSymlinks: listWhere((row) => Number(row['symlinks']) > 0),
  withSignatures: listWhere((row) => Array.isArray(row['signatures']) && row['signatures'].length > 0),
  methodsSeen: [...new Set(surveyed.flatMap((row) => Object.keys(row['methods'] as Record<string, number>)))],
  encrypted: listWhere((row) => Number(row['encrypted']) > 0),
};
const summary = {
  node: process.version,
  casesPassed: cases.filter((test) => test.pass).length,
  cases: cases.length,
  survey: totals,
  pass: cases.every((test) => test.pass),
};
process.stdout.write(`${JSON.stringify({ summary, cases, survey }, undefined, 2)}\n`);
process.exitCode = summary.pass ? 0 : 1;
