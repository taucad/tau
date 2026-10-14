/**
 * Spike S9 companion: which win_amd64 wheels pinned by the build123d lock bundle their own MSVC
 * runtime DLLs (msvcp*, vcruntime*, concrt*, vcomp*)? Reads only each wheel's central directory
 * (HTTP range requests, parsed as data with the S8 reader). Spike code only.
 * Usage: node scripts/spikes/native-deps/linux/s9/wheel-crt-survey.ts
 * Exit codes: 0 survey printed, 1 a metadata or range read failed.
 */

/* oxlint-disable no-restricted-imports -- spike modules sit outside scripts/src, so the #* import map cannot name them. */

import process from 'node:process';
import { lockedPackages, readCentralDirectory, selectWheel } from '../s8/survey.ts';

const rows: Array<{ wheel: string; nativeModules: number; crt: string[] }> = [];
const pureOnWindows: string[] = [];
for (const item of lockedPackages()) {
  // oxlint-disable-next-line no-await-in-loop -- sequential, polite metadata reads.
  const chosen = await selectWheel(item, (filename) => /-(?:win_amd64|any)\.whl$/u.test(filename), [
    /cp313-cp313-win_amd64/u,
    /abi3-win_amd64/u,
  ]);
  if (chosen === undefined) {
    continue;
  }
  if (chosen.filename.endsWith('-any.whl')) {
    pureOnWindows.push(chosen.filename);
    continue;
  }
  // oxlint-disable-next-line no-await-in-loop -- one or two range reads per wheel.
  const { entries } = await readCentralDirectory(chosen);
  const names = entries.map((entry) => entry.name);
  rows.push({
    wheel: chosen.filename,
    nativeModules: names.filter((name) => /\.(?:pyd|dll)$/iu.test(name)).length,
    crt: names.filter((name) => /(?:^|\/)(?:msvcp|vcruntime|concrt|vcomp)[^/]*\.dll$/iu.test(name)),
  });
}
process.stdout.write(`${JSON.stringify({ platformWheels: rows, pureWheels: pureOnWindows.length }, undefined, 2)}\n`);
