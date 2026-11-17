/**
 * Reject an expected-failure marker without an owner and an expiry, and a malformed flake ledger (taucad/tau#1281).
 *
 * A marker is a Vitest `it.fails` / `test.fails`, or a known-defect row's `expectedFailure: true` (ui-e2e
 * `cloudDefectRow`, `knownDefectRows`). The line directly above it must read
 * `// Expected-failure: @<owner> until YYYY-MM-DD`, no more than 28 days ahead. The weekly CI health report
 * (`ci-queue-health-cli.ts`) raises a marker or a `flake-ledger.json` entry once its day has passed; this check
 * only holds the shape, and a label it accepts once it keeps accepting.
 *
 * Usage: pnpm nx run scripts:validate-expected-failures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { ledgerProblems, overlongMarkers, scanExpectedFailureMarkers, unlabelledMarkers } from '#ci-flake-ledger.js';
import type { Ledger } from '#ci-flake-ledger.js';

const main = (): number => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const listed = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = listed
    .split('\0')
    .filter((path) => path !== '')
    .map((path) => ({ path, text: readFileSync(`${root}/${path}`, 'utf8') }));
  const markers = scanExpectedFailureMarkers(files);
  const problems = unlabelledMarkers(markers).map(
    (marker) =>
      `${marker.path}:${marker.line}: an expected failure needs "// Expected-failure: @<owner> until YYYY-MM-DD" on the line above it`,
  );
  problems.push(
    ...overlongMarkers(markers, new Date()).map(
      (marker) =>
        `${marker.path}:${marker.line}: an expected failure may stand at most 28 days ahead (until ${marker.until ?? ''})`,
    ),
  );
  const ledger = JSON.parse(readFileSync(`${root}/scripts/src/flake-ledger.json`, 'utf8')) as Ledger;
  problems.push(...ledgerProblems(ledger));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 1;
  }
  console.log(
    `${markers.length} expected-failure markers, each with an owner and an expiry; ${ledger.entries.length} ledger entries.`,
  );
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
