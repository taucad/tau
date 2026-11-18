/**
 * Purpose: What the sandbox's Rust executables share when they are staged for a desktop package: the pinned toolchain,
 *   the crates linked into the executable, and the NOTICE that carries every crate's and the toolchain's licence texts.
 * Why: `build-store-guard.mts` (Linux) and `build-windows-sandbox.mts` (Windows) ship one executable each beside the
 *   desktop app, and both must say exactly what they are built from.
 * Environment: Node 24+, rustup and cargo on PATH.
 * Usage: import { linkedCrates, crateNotice } from './rust-payload.mjs'
 * Exit codes: n/a (library module).
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

/**
 * Install the toolchain the crate's `rust-toolchain.toml` pins, with its targets and components; a no-op once present.
 *
 * @param crateRoot - The crate whose toolchain file applies.
 * @param what - What is being built, for the error when rustup is missing.
 */
export const ensureToolchain = (crateRoot: string, what: string): void => {
  try {
    execFileSync('rustup', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(`rustup is required to build ${what}: https://rustup.rs`);
  }
  execFileSync('rustup', ['toolchain', 'install'], {
    cwd: crateRoot,
    stdio: 'inherit',
  });
};

/**
 * The toolchain channel a crate pins.
 *
 * @param crateRoot - The crate.
 * @returns The `channel` of its `rust-toolchain.toml`, or `unknown`.
 */
export const pinnedToolchain = async (crateRoot: string): Promise<string> =>
  /channel = "([^"]+)"/u.exec(await readFile(resolve(crateRoot, 'rust-toolchain.toml'), 'utf8'))?.[1] ?? 'unknown';

const cargoPackage = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  license: z.string().nullish(),
  repository: z.string().nullish(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- cargo metadata's wire name.
  manifest_path: z.string(),
});

/** One crate as `cargo metadata` describes it. */
export type CargoPackage = z.infer<typeof cargoPackage>;

/** The parts of `cargo metadata --format-version 1` the closure walk reads. */
export const cargoMetadata = z.object({
  packages: z.array(cargoPackage),
  resolve: z.object({
    root: z.string(),
    nodes: z.array(
      z.object({
        id: z.string(),
        deps: z.array(
          z.object({
            pkg: z.string(),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- cargo metadata's wire name.
            dep_kinds: z.array(z.object({ kind: z.string().nullable() })),
          }),
        ),
      }),
    ),
  }),
});

const byNameAndVersion = (left: CargoPackage, right: CargoPackage): number =>
  left.name.localeCompare(right.name) || left.version.localeCompare(right.version);

/**
 * Every crate linked into the executable: the root crate's normal dependency closure. Dev and build dependencies are
 * not linked, so they are not walked.
 *
 * @param metadata - `cargo metadata` filtered to the executable's target platform.
 * @returns The crates, sorted by name and version.
 */
export const normalDependencyClosure = (metadata: z.infer<typeof cargoMetadata>): readonly CargoPackage[] => {
  const packages = new Map(metadata.packages.map((entry) => [entry.id, entry]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const pending = [metadata.resolve.root];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const dependency of nodes.get(id)?.deps ?? []) {
      /* A normal dependency has no kind; dev and build dependencies are not linked into the executable. */
      if (dependency.dep_kinds.some(({ kind }) => kind === null)) {
        pending.push(dependency.pkg);
      }
    }
  }
  const crates = [...seen].map((id) => packages.get(id)).filter((entry) => entry !== undefined);
  // oxlint-disable-next-line no-array-sort -- sorting a fresh copy.
  return crates.sort(byNameAndVersion);
};

/**
 * Every crate the executable is built from, for one target, from the locked dependency graph.
 *
 * @param crateRoot - The crate.
 * @param target - The Rust target triple the executable is built for.
 * @returns The crates, sorted by name and version.
 */
export const linkedCrates = (crateRoot: string, target: string): readonly CargoPackage[] =>
  normalDependencyClosure(
    cargoMetadata.parse(
      JSON.parse(
        execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', target, '--locked'], {
          cwd: crateRoot,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        }),
      ),
    ),
  );

/**
 * Where the pinned toolchain keeps its licence documents: `share/doc/rust` under its sysroot.
 *
 * @param crateRoot - The crate whose toolchain applies.
 * @returns The documents folder.
 */
export const toolchainDocuments = (crateRoot: string): string =>
  join(
    execFileSync('rustc', ['--print', 'sysroot'], {
      cwd: crateRoot,
      encoding: 'utf8',
    }).trim(),
    'share/doc/rust',
  );

/**
 * The Rust standard library's notice (`COPYRIGHT-library.html` from the toolchain), as plain text.
 *
 * @param documents - {@link toolchainDocuments}.
 * @returns The notice, with its markup removed and runs of blank lines collapsed.
 */
export const rustLibraryCopyright = async (documents: string): Promise<string> => {
  const html = await readFile(join(documents, 'COPYRIGHT-library.html'), 'utf8');
  return html
    .replaceAll(/<[^>]*>/gu, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n')
    .trim();
};

/**
 * One licence text the toolchain ships under `licenses/`.
 *
 * @param documents - {@link toolchainDocuments}.
 * @param name - The file, such as `MIT.txt`.
 * @returns The text, without trailing whitespace.
 */
export const toolchainLicence = async (documents: string, name: string): Promise<string> => {
  const text = await readFile(join(documents, 'licenses', name), 'utf8');
  return text.trimEnd();
};

/**
 * The NOTICE: the header, every crate with its licence expression, then the licence and notice texts each crate ships,
 * then the toolchain's own sections.
 *
 * @param header - The opening lines naming the executable.
 * @param crates - {@link linkedCrates}.
 * @param toolchain - The toolchain sections, line by line.
 * @returns The NOTICE text.
 */
export const crateNotice = async (
  header: readonly string[],
  crates: readonly CargoPackage[],
  toolchain: readonly string[],
): Promise<string> => {
  const sections = [
    ...header,
    '',
    ...crates.map(
      (entry) =>
        `- ${entry.name} ${entry.version}: ${entry.license ?? 'no licence expression'}${entry.repository ? ` (${entry.repository})` : ''}`,
    ),
  ];
  for (const entry of crates) {
    const directory = resolve(entry.manifest_path, '..');
    // oxlint-disable-next-line no-await-in-loop -- one listing per crate, in order, so the NOTICE is deterministic.
    const listing = await readdir(directory);
    // oxlint-disable-next-line no-array-sort -- sorting the filtered copy.
    const files = listing.filter((name) => /^(?:licen[cs]e|copying|notice)/iu.test(name)).sort();
    for (const file of files) {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const text = await readFile(join(directory, file), 'utf8').catch(() => undefined);
      if (text !== undefined) {
        sections.push('', `===== ${entry.name} ${entry.version}: ${file} =====`, '', text.trimEnd());
      }
    }
  }
  sections.push(...toolchain);
  return `${sections.join('\n')}\n`;
};

/**
 * The staged executable's manifest: what it is, what built it and what it links.
 *
 * @param input - The executable's version line, target, toolchain channel, digest, size and crates.
 * @returns The manifest JSON text.
 */
export const payloadManifest = (
  input: Readonly<{
    version: string;
    target: string;
    rust: string;
    sha256: string;
    bytes: number;
    crates: readonly CargoPackage[];
  }>,
): string =>
  `${JSON.stringify(
    {
      version: input.version,
      target: input.target,
      rust: input.rust,
      sha256: input.sha256,
      bytes: input.bytes,
      crates: input.crates.map(({ name, version, license }) => ({
        name,
        version,
        license: license ?? null,
      })),
    },
    undefined,
    2,
  )}\n`;
