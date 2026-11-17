/**
 * The UI to API version-skew contract (tau #2016): every commit and version tag the last released UI writes is
 * backed up by this API's `pre-receive` hook.
 *
 * The UI and the API release independently, so production pairs the newest API with a UI one or more releases
 * older. api@0.10.0 narrowed the authorship check to the version 2 record while production still served ui@0.8.0,
 * and every cloud backup from tau.new was refused for about 21 hours (incident
 * `2026-11-12-prod-cloud-backup-push-refused`). `released-ui-writer.json` holds the objects that release's own writer
 * produced (`scripts/pin-released-ui-writer.ts`), and this suite pushes each one through the hook the API writes into
 * every repository. A change to the hook that would refuse production's UI fails here, before it ships.
 *
 * When it fails, keep reading the shape the pinned release writes for one more release, or release the UI that
 * writes the new shape first and re-pin once it is live. Re-pinning to a UI that production does not serve yet hides
 * the refusal; it does not prevent it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preReceiveHookScript } from '#git.constants.js';

type PinnedObject = Readonly<{
  scenario: string;
  type: 'commit' | 'tag';
  ref: string;
  forge?: string;
  body: string;
}>;
type PinnedWriter = Readonly<{
  release: string;
  commit: string;
  pusher: string;
  tree: string;
  parent: string;
  objects: readonly PinnedObject[];
}>;

const pinned = JSON.parse(
  await readFile(path.join(import.meta.dirname, 'released-ui-writer.json'), 'utf8'),
) as PinnedWriter;

const none = '0'.repeat(40);
const realGit = execFileSync('sh', ['-c', 'command -v git'], {
  encoding: 'utf8',
}).trim();

describe(`objects written by the released UI (${pinned.release}) against this API's pre-receive hook`, () => {
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
  const store = async (object: PinnedObject): Promise<string> => {
    const file = path.join(directory, '.git', `pinned-${String(Math.random()).slice(2)}`);
    await writeFile(file, object.body.replaceAll(pinned.tree, tree).replaceAll(pinned.parent, base), 'utf8');
    return git('hash-object', '-t', object.type, '-w', file);
  };

  /** One hook run, as the API runs it for the pinned account's push of `tip` to `ref`. */
  const push = async (
    tip: string,
    ref: string,
    forge: string | undefined,
  ): Promise<{ code: number | undefined; stderr: string }> =>
    new Promise((resolve) => {
      const child = spawn('sh', [hookPath], {
        cwd: directory,
        env: {
          ...environment,
          /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
          TAU_GIT_PUSH_ADMITTED: '1',
          TAU_GIT_PUSHER: pinned.pusher,
          TAU_GIT_NODE: process.execPath,
          ...(forge === undefined ? {} : { TAU_GIT_FORGE: forge }),
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

  it('pins a released ui@ writer with something to push', () => {
    expect(pinned.release).toMatch(/^ui@\d+\.\d+\.\d+/u);
    expect(pinned.objects.some((object) => object.type === 'commit')).toBe(true);
  });

  it.each(pinned.objects.map((object) => [object.scenario, object] as const))(
    'backs up "%s"',
    async (_scenario, object) => {
      const outcome = await push(await store(object), object.ref, object.forge);
      expect(outcome.stderr, `${pinned.release} writes this; the hook must accept it`).toBe('');
      expect(outcome.code).toBe(0);
    },
  );
});
