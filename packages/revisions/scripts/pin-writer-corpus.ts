/**
 * Pin what every Tau writer leg records, per release since version 2, into the provenance golden corpus
 * (cloud backup admission blueprint D10 (b), (e); gate G2).
 *
 * The UI, the desktop app and the API ship independently, so the reader and the server must keep reading what
 * any released writer produced (incident `2026-11-12-prod-cloud-backup-push-refused`). This script reads
 * `packages/revisions` exactly as each `ui@` and `desktop@` tag released it (`git archive`) and runs that release's
 * own writer functions — the ones both adapters call — over every leg's scenarios
 * (`src/test/writer-scenarios.ts`). Each release lands in
 * `src/provenance/corpus/writers/<release>.json`; the working tree lands in `writers/current.json`, which
 * `src/provenance/writers.test.ts` regenerates and compares byte for byte (G2). A release whose writer still wrote
 * version 1 records is skipped: version 1 is classified from headers, not pinned.
 *
 * Run it after every `ui@` or `desktop@` release, and after any change to a record writer (testing policy).
 * `released-ui-writer.test.ts` in `api-git-core` pushes every pinned object through the hook (P8).
 *
 * Usage: node packages/revisions/scripts/pin-writer-corpus.ts [--release <tag>]... [--check]
 *   --release <tag>  Pin only these releases (and the working tree). Defaults to every `ui@*` and `desktop@*` tag.
 *   --check          Write nothing; exit 1 when a known release or the working tree is not pinned as it writes.
 * Exit codes: 0 written or current; 1 stale (`--check`); 2 usage, git or writer failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { writeScenarios, writerParent, writerPusher, writerTree } from '#test/writer-scenarios.js';
import type { PinnedWriter, WriterFunctions } from '#test/writer-scenarios.js';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const writersDirectory = path.join(packageRoot, 'src/provenance/corpus/writers');

const git = (...args: readonly string[]): string =>
  execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

/** Every `ui@*` and `desktop@*` tag, fetched first so a shallow checkout does not miss one. */
const releaseTags = (): string[] => {
  try {
    git('fetch', '--quiet', '--tags', 'origin');
  } catch {
    /* Offline: the local tags are the best answer there is. */
  }
  return git('tag', '--list', 'ui@*', 'desktop@*', '--sort=v:refname').split('\n').filter(Boolean);
};

const loadWriter = async (root: string): Promise<WriterFunctions> => {
  const load = async (module: string): Promise<Record<string, unknown>> =>
    import(pathToFileURL(path.join(root, 'src', module)).href) as Promise<Record<string, unknown>>;
  const [headers, objects] = await Promise.all([load('revision-headers.ts'), load('git-objects.ts')]);
  /* A released tree's own types are not this tree's: name only the calls the scenarios make. */
  return { ...headers, ...objects } as unknown as WriterFunctions;
};

/** The writer of `packages/revisions` at `release`, loaded from an extracted copy of that tree. */
const releasedWriter = async (release: string) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tau-writer-corpus-'));
  const archive = path.join(directory, 'revisions.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, release, 'packages/revisions'], {
    cwd: repoRoot,
  });
  execFileSync('tar', ['-xf', archive, '-C', directory]);
  const root = path.join(directory, 'packages/revisions');
  /* Third-party imports (`zod`) resolve from the workspace's install; the released source itself is the tag's. */
  await symlink(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return { writer: await loadWriter(root), dispose: async () => rm(directory, { recursive: true, force: true }) };
};

const pinned = (release: string, commit: string, writer: WriterFunctions): PinnedWriter => ({
  release,
  commit,
  pusher: writerPusher,
  tree: writerTree,
  parent: writerParent,
  objects: writeScenarios(writer),
});

const serialise = (fixture: PinnedWriter): string => `${JSON.stringify(fixture, undefined, 2)}\n`;

const fileOf = (release: string): string => path.join(writersDirectory, `${release}.json`);

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** Every fixture to write: each version 2 release asked for, then the working tree. */
const fixtures = async (releases: readonly string[]): Promise<PinnedWriter[]> => {
  const out: PinnedWriter[] = [];
  for (const release of releases) {
    // oxlint-disable-next-line no-await-in-loop -- one extracted tree at a time
    const loaded = await releasedWriter(release);
    try {
      const fixture = pinned(release, git('rev-list', '-n', '1', release), loaded.writer);
      if (fixture.objects.some((object) => object.type === 'commit' && object.body.includes('"version":2'))) {
        out.push(fixture);
      }
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await loaded.dispose();
    }
  }
  out.push(pinned('current', '', await loadWriter(packageRoot)));
  return out;
};

const main = async (argv: readonly string[]): Promise<number> => {
  const check = argv.includes('--check');
  const asked = argv.flatMap((argument, index) => (argv[index - 1] === '--release' ? [argument] : []));
  const unknown = argv.filter(
    (argument, index) => !['--release', '--check'].includes(argument) && argv[index - 1] !== '--release',
  );
  if (unknown.length > 0 || asked.some((tag) => !/^(?:ui|desktop)@\d+\.\d+\.\d+/u.test(tag))) {
    process.stderr.write('Usage: pin-writer-corpus.ts [--release <tag>]... [--check]\n');
    return 2;
  }
  const releases = asked.length > 0 ? asked : releaseTags();
  const written = await fixtures(releases);
  if (check) {
    const stale: string[] = [];
    for (const fixture of written) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of small files
      if ((await readText(fileOf(fixture.release))) !== serialise(fixture)) {
        stale.push(fixture.release);
      }
    }
    if (stale.length > 0) {
      process.stderr.write(`Not pinned as written: ${stale.join(', ')}. Run this script to refresh the corpus.\n`);
      return 1;
    }
    process.stdout.write(`Every writer is pinned (${String(written.length)} files).\n`);
    return 0;
  }
  await mkdir(writersDirectory, { recursive: true });
  for (const fixture of written) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of small files
    await writeFile(fileOf(fixture.release), serialise(fixture), 'utf8');
  }
  const listing = await readdir(writersDirectory);
  const files = listing.filter((file) => file.endsWith('.json'));
  process.stdout.write(`Pinned ${String(written.length)} writers; the corpus holds ${String(files.length)}.\n`);
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
