/**
 * Pin the commits and version tags the last released UI writes, as the fixture the version-skew contract suite
 * (`src/version-skew/released-ui-writer.test.ts`, tau #2016) pushes through the current API's `pre-receive` hook.
 *
 * The UI and the API ship independently, so production can serve an older UI against a newer API (incident
 * `2026-11-12-prod-cloud-backup-push-refused`: api@0.10.0 read only version 2 trailers while ui@0.8.0 still wrote
 * the older one). This script reads `packages/revisions` exactly as the `ui@` tag released it (`git archive`), and
 * writes one commit or tag per scenario with that release's own writer functions — the ones both of its adapters
 * call — so the fixture is the released bytes, not a hand-copied record.
 *
 * Run it after every `ui@` release, and before a change that narrows what the hook reads lands in an API release.
 * The suite fails when the hook would refuse the fixture; refreshing the fixture to a UI that is not yet in
 * production does not make that refusal safe.
 *
 * Usage: node apps/libs/api-git-core/scripts/pin-released-ui-writer.ts [--tag ui@<version>] [--check]
 *   --tag ui@<version>  The release to pin. Defaults to the newest `ui@*` tag.
 *   --check             Write nothing; exit 1 when the fixture does not pin the newest `ui@*` tag.
 * Exit codes: 0 written or current; 1 the fixture is stale (`--check`); 2 usage, git or writer failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const fixturePath = path.resolve(import.meta.dirname, '../src/version-skew/released-ui-writer.json');

/** The account the fixture records as signed in and pushing; the suite pushes as this id. */
export const fixturePusher = 'user_released_ui_writer';
/** Stand-ins for the tree and parent the writer was given; the suite swaps in its own repository's ids. */
export const fixtureTree = 'a'.repeat(40);
export const fixtureParent = 'b'.repeat(40);

/** One object the released UI writes, and how the suite pushes it. */
export type PinnedObject = Readonly<{
  /** What the user or agent did, in a few words. */
  scenario: string;
  type: 'commit' | 'tag';
  /** The ref the UI pushes it to. */
  ref: string;
  /** `TAU_GIT_FORGE` for a project linked to a forge; absent otherwise. */
  forge?: string;
  /** The raw object body, with {@link fixtureTree} and {@link fixtureParent} as written. */
  body: string;
}>;

/** The fixture file. */
export type PinnedWriter = Readonly<{
  /** The `ui@` tag pinned. */
  release: string;
  /** The commit that tag names. */
  commit: string;
  pusher: string;
  tree: string;
  parent: string;
  objects: readonly PinnedObject[];
}>;

const git = (...args: readonly string[]): string =>
  execFileSync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

/** The newest `ui@*` tag, fetched first so a shallow checkout does not answer with a stale one. */
const newestUiTag = (): string => {
  try {
    git('fetch', '--quiet', '--tags', 'origin');
  } catch {
    /* Offline: the local tags are the best answer there is, and `--check` says which it used. */
  }
  const tag = git('tag', '--list', 'ui@*', '--sort=-v:refname').split('\n')[0] ?? '';
  if (tag === '') {
    throw new Error('No ui@ tag is known to this checkout.');
  }
  return tag;
};

/** The writer modules of `packages/revisions` at `release`, loaded from an extracted copy of that tree. */
const loadReleasedWriter = async (release: string) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tau-released-ui-writer-'));
  const archive = path.join(directory, 'revisions.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, release, 'packages/revisions'], {
    cwd: repoRoot,
  });
  execFileSync('tar', ['-xf', archive, '-C', directory]);
  const root = path.join(directory, 'packages/revisions');
  /* Third-party imports (`zod`) resolve from the workspace's install; the released source itself is the tag's. */
  await symlink(path.join(repoRoot, 'packages/revisions/node_modules'), path.join(root, 'node_modules'), 'dir');
  const load = async (module: string): Promise<Record<string, unknown>> =>
    import(pathToFileURL(path.join(root, 'src', module)).href) as Promise<Record<string, unknown>>;
  const [headers, objects] = await Promise.all([load('revision-headers.ts'), load('git-objects.ts')]);
  /* The released tree's own types are not this tree's: name only the calls made here. */
  const writer = { ...headers, ...objects } as unknown as ReleasedWriter;
  return {
    writer,
    dispose: async () => rm(directory, { recursive: true, force: true }),
  };
};

/** The writer functions of `revision-headers.ts` and `git-objects.ts` this script calls. */
type ReleasedWriter = Readonly<{
  revisionAuthorSignature: (provenance: unknown, commitAuthor?: unknown) => unknown;
  revisionCommitterSignature: (provenance: unknown) => unknown;
  revisionCommitMessage: (trailer: unknown) => string;
  deriveChangeId: (objectFormat: 'sha1', input: unknown) => Uint8Array<ArrayBuffer>;
  taggerSignature: (actor: unknown, createdAt: number) => unknown;
  revisionTagMessage: (input: unknown) => string;
  encodeCommit: (input: unknown) => Readonly<{ body: Uint8Array<ArrayBuffer> }>;
  encodeTag: (input: unknown) => Readonly<{ body: Uint8Array<ArrayBuffer> }>;
}>;

/** One commit as the released adapters write it: `writeRevision` in `isomorphic-git-adapter.ts` and `native-git-port.ts`. */
const writeCommit = (
  writer: ReleasedWriter,
  input: Readonly<{
    provenance: Record<string, unknown>;
    summary: string;
    commitAuthor?: Record<string, string>;
  }>,
): string => {
  const trailer = {
    parents: [fixtureParent],
    provenance: input.provenance,
    summary: { generated: input.summary },
  };
  const encoded = writer.encodeCommit({
    objectFormat: 'sha1',
    tree: fixtureTree,
    parents: [fixtureParent],
    author: writer.revisionAuthorSignature(input.provenance, input.commitAuthor),
    committer: writer.revisionCommitterSignature(input.provenance),
    message: writer.revisionCommitMessage(trailer),
    changeId: writer.deriveChangeId('sha1', {
      treeId: fixtureTree,
      parents: [fixtureParent],
      trailer,
    }),
  });
  return new TextDecoder().decode(encoded.body);
};

/** One version tag as the released adapters write it. */
const writeTag = (
  writer: ReleasedWriter,
  input: Readonly<{
    number: number;
    name: string;
    note?: string;
    actor: Record<string, unknown>;
    createdAt: number;
  }>,
): string => {
  const encoded = writer.encodeTag({
    objectFormat: 'sha1',
    object: fixtureParent,
    tag: `v${String(input.number)}`,
    tagger: writer.taggerSignature(input.actor, input.createdAt),
    message: writer.revisionTagMessage({
      id: '0123456789abcdef0123456789abcdef',
      name: input.name,
      note: input.note,
      actor: input.actor,
    }),
  });
  return new TextDecoder().decode(encoded.body);
};

/** Every shape of record the UI writes for a signed-in person: each one a push that must be backed up. */
const pin = (writer: ReleasedWriter): PinnedObject[] => {
  const createdAt = 1_790_000_000_000;
  const person = { kind: 'user', id: fixturePusher, name: 'Released Writer' };
  const agent = {
    kind: 'agent',
    id: 'claude',
    runId: 'run_released',
    onBehalfOf: person,
  };
  const anonymous = {
    kind: 'user',
    id: 'anon:5e1ea5edc0de',
    name: 'Anonymous',
    anonymous: true,
  };
  const commit = (
    scenario: string,
    provenance: Record<string, unknown>,
    options: Readonly<{
      forge?: string;
      commitAuthor?: Record<string, string>;
    }> = {},
  ): PinnedObject => ({
    scenario,
    type: 'commit',
    ref: 'refs/heads/main',
    ...(options.forge === undefined ? {} : { forge: options.forge }),
    body: writeCommit(writer, {
      provenance: { createdAt, ...provenance },
      summary: scenario,
      ...(options.commitAuthor === undefined ? {} : { commitAuthor: options.commitAuthor }),
    }),
  });
  return [
    commit('Start version of a new project', {
      source: 'user',
      actor: person,
      capture: 'create',
      via: 'browser',
    }),
    commit('Saved in the browser', {
      source: 'user',
      actor: person,
      capture: 'save',
      via: 'browser',
    }),
    commit('Saved when the tab was hidden', {
      source: 'user',
      actor: person,
      capture: 'hidden',
      via: 'browser',
    }),
    commit('Agent turn on the signed-in person’s behalf', {
      source: 'agent',
      actor: agent,
      capture: 'turn',
      via: 'browser',
      runId: 'run_released',
      turnCut: 'result',
      turnId: 'turn_released',
    }),
    commit('Restored an earlier version', {
      source: 'restore',
      actor: person,
      capture: 'restore',
      via: 'browser',
      restoredFrom: fixtureParent,
    }),
    commit('Saved anonymously', {
      source: 'user',
      actor: anonymous,
      capture: 'save',
      via: 'browser',
    }),
    commit(
      'Saved in a project linked to GitHub',
      { source: 'user', actor: person, capture: 'save', via: 'browser' },
      {
        forge: 'github',
        commitAuthor: {
          name: 'released-writer',
          email: '1234567+released-writer@users.noreply.github.com',
        },
      },
    ),
    {
      scenario: 'Named a version',
      type: 'tag',
      ref: 'refs/tags/v2',
      body: writeTag(writer, {
        number: 2,
        name: 'Ready for print',
        actor: person,
        createdAt,
      }),
    },
  ];
};

const readFixture = async (): Promise<PinnedWriter | undefined> => {
  try {
    return JSON.parse(await readFile(fixturePath, 'utf8')) as PinnedWriter;
  } catch {
    return undefined;
  }
};

const main = async (argv: readonly string[]): Promise<number> => {
  const tagIndex = argv.indexOf('--tag');
  const check = argv.includes('--check');
  const unknown = argv.filter(
    (argument, index) => !['--tag', '--check'].includes(argument) && argv[index - 1] !== '--tag',
  );
  if (unknown.length > 0 || (tagIndex !== -1 && !/^ui@\d+\.\d+\.\d+/u.test(argv[tagIndex + 1] ?? ''))) {
    process.stderr.write('Usage: pin-released-ui-writer.ts [--tag ui@<version>] [--check]\n');
    return 2;
  }
  const release = tagIndex === -1 ? newestUiTag() : (argv[tagIndex + 1] ?? '');
  if (check) {
    const pinned = await readFixture();
    if (pinned?.release === release) {
      process.stdout.write(`The fixture pins ${release}, the newest ui@ release.\n`);
      return 0;
    }
    process.stderr.write(
      `The fixture pins ${pinned?.release ?? 'nothing'}, but the newest ui@ release is ${release}. Run this script to refresh it.\n`,
    );
    return 1;
  }
  const released = await loadReleasedWriter(release);
  try {
    const fixture: PinnedWriter = {
      release,
      commit: git('rev-list', '-n', '1', release),
      pusher: fixturePusher,
      tree: fixtureTree,
      parent: fixtureParent,
      objects: pin(released.writer),
    };
    await writeFile(fixturePath, `${JSON.stringify(fixture, undefined, 2)}\n`, 'utf8');
    process.stdout.write(`Pinned ${String(fixture.objects.length)} objects written by ${release} to ${fixturePath}.\n`);
    return 0;
  } finally {
    await released.dispose();
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
