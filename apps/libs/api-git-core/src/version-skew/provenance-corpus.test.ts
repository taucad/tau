/**
 * P8 over the provenance golden corpus (cloud backup admission blueprint, Test plan; tau #2016's version-skew
 * contract, generalised by D10 (b), (e)): every commit any Tau writer leg wrote in any release since version 2, and
 * every hand-built corpus case, is backed up by this API's `pre-receive` hook; a version tag is admitted exactly when
 * the provenance module reads it as a version, and otherwise refused under its code with the marker shipped clients
 * file as fatal.
 *
 * The UI, the desktop app and the API release independently (incident `2026-11-12-prod-cloud-backup-push-refused`:
 * api@0.10.0 narrowed what the hook read while production still served ui@0.8.0). The corpus lives with the module
 * (`packages/revisions/src/provenance/corpus/`); `packages/revisions/scripts/pin-writer-corpus.ts` pins each
 * release's own writer output there. A change to the hook that would refuse one of them fails here, before it ships.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitRefusalMarker, hookCodeLinePrefix, preReceiveHookScript } from '#git.constants.js';

type PinnedObject = Readonly<{ scenario: string; leg?: string; type: 'commit' | 'tag'; ref: string; body: string }>;
type PinnedWriter = Readonly<{ release: string; tree: string; parent: string; objects: readonly PinnedObject[] }>;
type CorpusEntry = Readonly<{ id: string; title: string; type: 'commit' | 'tag'; ref: string; body: string }>;
type Corpus = Readonly<{ tree: string; parent: string; entries: readonly CorpusEntry[] }>;

const corpusDirectory = path.resolve(import.meta.dirname, '../../../../../packages/revisions/src/provenance/corpus');
const writerListing = await readdir(path.join(corpusDirectory, 'writers'));
const writerFiles = writerListing.filter((file) => file.endsWith('.json'));
const writers = await Promise.all(
  writerFiles.map(
    async (file) => JSON.parse(await readFile(path.join(corpusDirectory, 'writers', file), 'utf8')) as PinnedWriter,
  ),
);
const corpus = JSON.parse(await readFile(path.join(corpusDirectory, 'corpus.json'), 'utf8')) as Corpus;
const expected = JSON.parse(await readFile(path.join(corpusDirectory, 'expected.json'), 'utf8')) as Readonly<
  Record<string, Readonly<{ reading: Readonly<{ shape: string }> }>>
>;
/** The pusher the hook sees; the hook reads no authorship, so any account will do. */
const pusher = 'user_PusherAccountIdA12345';

/** One object to push, with the placeholder ids it was written against and whether the hook must admit it. */
type Case = Readonly<{ label: string; object: PinnedObject; tree: string; parent: string; admitted: boolean }>;
const cases: readonly Case[] = [
  ...writers.flatMap((writer) =>
    writer.objects.map((object) => ({
      label: `${writer.release} ${object.leg ?? ''}: ${object.scenario}`,
      object,
      tree: writer.tree,
      parent: writer.parent,
      admitted: true,
    })),
  ),
  ...corpus.entries.map((entry) => ({
    label: `corpus ${entry.id}: ${entry.title}`,
    object: { scenario: entry.title, type: entry.type, ref: entry.ref, body: entry.body },
    tree: corpus.tree,
    parent: corpus.parent,
    admitted: entry.type === 'commit' || expected[entry.id]?.reading.shape === 'tau/2',
  })),
];

const none = '0'.repeat(40);
const realGit = execFileSync('sh', ['-c', 'command -v git'], {
  encoding: 'utf8',
}).trim();

describe("the provenance corpus against this API's pre-receive hook (P8)", () => {
  let directory: string;
  let hookPath: string;
  let environment: Record<string, string>;
  let base: string;
  let tree: string;

  const git = (...args: readonly string[]): string =>
    execFileSync(realGit, [...args], {
      cwd: directory,
      env: environment as NodeJS.ProcessEnv,
      encoding: 'utf8',
    }).trim();

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tau-released-ui-writer-'));
    hookPath = path.join(directory, 'pre-receive');
    await writeFile(hookPath, preReceiveHookScript, 'utf8');
    await chmod(hookPath, 0o755);
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
    environment = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: directory,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Base',
      GIT_AUTHOR_EMAIL: 'base@tau.test',
      GIT_COMMITTER_NAME: 'Base',
      GIT_COMMITTER_EMAIL: 'base@tau.test',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
    git('init', '--quiet', '--initial-branch=main', '.');
    git('commit', '--quiet', '--allow-empty', '-m', 'base');
    base = git('rev-parse', 'HEAD');
    tree = git('rev-parse', 'HEAD^{tree}');
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  /** Write one pinned object into the repository, on this repository's tree and base commit. */
  const store = async (item: Case): Promise<string> => {
    const { object } = item;
    const file = path.join(directory, '.git', `pinned-${String(Math.random()).slice(2)}`);
    await writeFile(file, item.object.body.replaceAll(item.tree, tree).replaceAll(item.parent, base), 'utf8');
    return git('hash-object', '-t', object.type, '-w', file);
  };

  /** One hook run, as the API runs it for a push of `tip` to `ref`: `main` from the base, any other ref created. */
  const push = async (tip: string, ref: string): Promise<{ code: number | undefined; stderr: string }> =>
    new Promise((resolve) => {
      const child = spawn('sh', [hookPath], {
        cwd: directory,
        env: {
          ...environment,
          /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
          TAU_GIT_PUSH_ADMITTED: '1',
          TAU_GIT_PUSHER: pusher,
          TAU_GIT_NODE: process.execPath,
          /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
        } as unknown as NodeJS.ProcessEnv,
      });
      const stderr: Array<Uint8Array<ArrayBuffer>> = [];
      child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
      child.stdin.end(`${ref === 'refs/heads/main' ? base : none} ${tip} ${ref}\n`);
      child.on('close', (code) => {
        resolve({
          code: code ?? undefined,
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
    });

  it('holds every writer release and the hand-built corpus', () => {
    expect(writers.map(({ release }) => release)).toContain('current');
    expect(writers.some(({ release }) => release.startsWith('ui@'))).toBe(true);
    expect(writers.some(({ release }) => release.startsWith('desktop@'))).toBe(true);
    expect(corpus.entries.length).toBeGreaterThan(40);
  });

  it.each(cases.map((item) => [item.label, item] as const))('pushes %s', async (_label, item) => {
    const outcome = await push(await store(item), item.object.ref);
    if (item.admitted) {
      expect(outcome.stderr, 'a Tau writer or a corpus commit: the hook must back it up').toBe('');
      expect(outcome.code).toBe(0);
      return;
    }
    expect(outcome.code).toBe(1);
    expect(outcome.stderr.startsWith(`${hookCodeLinePrefix}GIT_PUSH_VERSION_TAG_INVALID 1`), outcome.stderr).toBe(true);
    expect(outcome.stderr).toContain(commitRefusalMarker);
  });
});
