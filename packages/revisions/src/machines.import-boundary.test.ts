import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * I20/AC22: a revision machine is host-neutral. It may import XState, its
 * sibling machines, and types from this package's own contracts — nothing else.
 * A filesystem, git, React or DOM import here would put lifecycle logic on one
 * host's side of the seam.
 */

const sourceDirectory = new URL('.', import.meta.url).pathname;

const machineFiles = (): readonly string[] =>
  readdirSync(sourceDirectory)
    .filter((entry) => entry.endsWith('.machine.ts'))
    .map((entry) => join(sourceDirectory, entry));

type Import = Readonly<{ file: string; specifier: string; typeOnly: boolean }>;

const importsOf = (file: string): readonly Import[] =>
  [...readFileSync(file, 'utf8').matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';$/gmu)].map((match) => ({
    file,
    specifier: match[2] ?? '',
    typeOnly: match[1] !== undefined,
  }));

const importsXstate = (specifier: string): boolean => specifier === 'xstate' || specifier.startsWith('xstate/');
const importsSiblingMachine = (specifier: string): boolean => /^#[a-z-]+\.machine\.js$/u.test(specifier);
const importsPackageContract = (specifier: string): boolean =>
  specifier === '#revision-port.js' || specifier === '#revision-authority.js' || specifier === '#remotes.js';

/*
 * The one module a machine may call at runtime. I20/AC22 is about host
 * coupling — a filesystem, git, React or DOM import on one host's side of the
 * seam — and `refusal-markers.ts` imports nothing at all: it is a string the
 * server prints and a predicate over it, so both the transport classifier and
 * the scheduler can file the same refusal the same way without either
 * importing the other. The row below pins the premise.
 */
const importsRefusalMarkers = (specifier: string): boolean => specifier === '#refusal-markers.js';

describe('revision machine import boundary', () => {
  it('finds every machine subpath module', () => {
    expect(
      machineFiles()
        .map((file) => file.slice(sourceDirectory.length))
        .sort(),
    ).toEqual([
      'branch.machine.ts',
      'checkout.machine.ts',
      'checkouts.machine.ts',
      'project-revisions.machine.ts',
      'publish.machine.ts',
      'remote.machine.ts',
      'resolution.machine.ts',
      'restore.machine.ts',
      'sync.machine.ts',
      'turn.machine.ts',
    ]);
  });

  /* S48(10) asks for the boundary of every machine *subpath*, not every machine
   * file: a machine nothing exports is unreachable to a host, and a subpath
   * that names a module which is not a machine is a boundary nobody checks. */
  it('exports exactly one subpath per machine module', () => {
    const manifest = JSON.parse(readFileSync(join(sourceDirectory, '../package.json'), 'utf8')) as Readonly<{
      exports: Readonly<Record<string, string>>;
    }>;
    const subpaths = Object.entries(manifest.exports)
      .filter(([subpath]) => subpath.endsWith('-machine'))
      .map(([subpath, target]) => `${subpath} → ${target}`)
      .toSorted();

    expect(subpaths).toEqual(
      machineFiles()
        .map((file) => file.slice(sourceDirectory.length))
        .map((name) => `./${name.replace('.machine.ts', '-machine')} → ./src/${name}`)
        .toSorted(),
    );
  });

  it('imports only xstate, sibling machines and this package own types', () => {
    const offenders = machineFiles()
      .flatMap((file) => importsOf(file))
      .filter(
        (entry) =>
          !importsXstate(entry.specifier) &&
          !importsSiblingMachine(entry.specifier) &&
          !importsRefusalMarkers(entry.specifier) &&
          !(importsPackageContract(entry.specifier) && entry.typeOnly),
      );

    expect(offenders).toEqual([]);
  });

  it('keeps the one runtime-importable module import-free, which is why it is allowed', () => {
    const leaf = readFileSync(join(sourceDirectory, 'refusal-markers.ts'), 'utf8');

    expect(leaf).not.toMatch(/^import\s/mu);
  });

  it('imports nothing from the filesystem, git, node builtins, React or the DOM', () => {
    const forbidden =
      /from\s+'(?:@taucad\/filesystem[^']*|@taucad\/fs-bridge[^']*|isomorphic-git[^']*|node:[^']*|react[^']*|react-dom[^']*)'/u;

    const offenders = machineFiles().filter((file) => forbidden.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('proves the check is not vacuous: a non-machine module does import the filesystem', () => {
    const port = readFileSync(join(sourceDirectory, 'revision-port.ts'), 'utf8');

    expect(port).toContain("from '@taucad/filesystem/revisions'");
  });
});
