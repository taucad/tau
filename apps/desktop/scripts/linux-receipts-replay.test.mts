#!/usr/bin/env node
/**
 * Purpose: Replay saved real Linux clean-host row artifacts through the `linux-receipts` job's own steps at PR time
 * (D-H8), so a defect in candidate re-admission or receipt collection fails here instead of after a ~4 h GPU matrix.
 *
 * The rows and candidate manifest are the unchanged content of acceptance run 42706520569 and candidate C run
 * 42392372853 (see fixtures/linux-receipts-replay/replay.json). Both scripts run as their own processes from a fresh
 * directory holding nothing but what the job's checkout and download-artifact steps leave, with the job's environment.
 * Only the network and repository edges are replaced: `gh` serves the recorded run and artifact metadata and a
 * candidate archive holding the real manifest, and `git` answers only the two recorded ancestry facts.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable @typescript-eslint/naming-convention -- The replay serves exact GitHub wire fields and sets process environment keys. */

const scripts = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(scripts, 'fixtures', 'linux-receipts-replay');
const register = import.meta.resolve('@oxc-node/core/register');
const replay = JSON.parse(readFileSync(join(fixtures, 'replay.json'), 'utf8')) as {
  acceptanceRun: { id: number; headSha: string };
  candidateRun: { id: number; headSha: string; artifactId: number };
  sourceCommit: string;
  trust: { aptPrimaryFingerprint: string; aptSigningFingerprint: string; appImageKeyId: string };
};
const rowIds = [
  'ubuntu-apt-x11',
  'ubuntu-appimage-x11',
  'ubuntu2604-apt-x11',
  'ubuntu2604-appimage-x11',
  'debian-apt-x11',
  'debian-appimage-x11',
];

/** The edges a GitHub runner provides: recorded API answers, the candidate archive and two ancestry facts. */
const writeEdges = (bin: string, archive: string, digest: string): void => {
  mkdirSync(bin);
  const run = {
    id: replay.candidateRun.id,
    status: 'completed',
    path: '.github/workflows/desktop-installer-candidate.yml',
    head_branch: 'main',
    head_sha: replay.candidateRun.headSha,
    event: 'workflow_dispatch',
    conclusion: 'success',
    repository: { full_name: 'taucad/tau' },
    head_repository: { full_name: 'taucad/tau' },
  };
  const artifacts = {
    artifacts: [
      {
        id: replay.candidateRun.artifactId,
        name: 'desktop-linux-installer-candidate',
        expired: false,
        digest: `sha256:${digest}`,
        workflow_run: { id: replay.candidateRun.id, head_sha: replay.candidateRun.headSha },
      },
    ],
  };
  const responses = {
    [`repos/taucad/tau/actions/runs/${replay.candidateRun.id}`]: JSON.stringify(run),
    [`repos/taucad/tau/actions/runs/${replay.candidateRun.id}/artifacts?per_page=100`]: JSON.stringify(artifacts),
  };
  const ancestry = [
    `${replay.candidateRun.headSha} ${replay.acceptanceRun.headSha}`,
    `${replay.sourceCommit} ${replay.acceptanceRun.headSha}`,
  ];
  const gh = `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const [command, path, ...rest] = process.argv.slice(2);
const responses = ${JSON.stringify(responses)};
if (command !== 'api' || rest.length > 0) process.exit(2);
if (path === 'repos/taucad/tau/actions/artifacts/${replay.candidateRun.artifactId}/zip') {
  process.stdout.write(readFileSync(${JSON.stringify(archive)}));
} else if (path in responses) {
  process.stdout.write(responses[path]);
} else {
  process.stderr.write('unrecorded gh api ' + path + '\\n');
  process.exit(1);
}
`;
  const git = `#!/usr/bin/env node
const [command, flag, ancestor, descendant, ...rest] = process.argv.slice(2);
const recorded = ${JSON.stringify(ancestry)};
process.exit(command === 'merge-base' && flag === '--is-ancestor' && rest.length === 0 && recorded.includes(ancestor + ' ' + descendant) ? 0 : 1);
`;
  writeFileSync(join(bin, 'gh'), gh);
  writeFileSync(join(bin, 'git'), git);
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'git'), 0o755);
};

/** A directory in the state the linux-receipts job leaves it: checked out, with no out/ tree yet. */
const prepareWorkspace = (): { workspace: string; env: NodeJS.ProcessEnv } => {
  const workspace = mkdtempSync(join(tmpdir(), 'tau-linux-receipts-replay-'));
  const staging = join(workspace, 'edges');
  mkdirSync(staging);
  writeFileSync(join(staging, 'desktop-artifacts.json'), readFileSync(join(fixtures, 'desktop-artifacts.json')));
  const archive = join(staging, 'candidate.zip');
  execFileSync('zip', ['-q', '-j', archive, join(staging, 'desktop-artifacts.json')]);
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const bin = join(staging, 'bin');
  writeEdges(bin, archive, digest);
  const job = join(workspace, 'job');
  mkdirSync(job);
  return {
    workspace: job,
    env: {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: process.env['HOME'],
      // Workflow-level environment of desktop-route-vm-acceptance.yml for scope=linux.
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
      TAU_DESKTOP_ACCEPTANCE_KIND: 'vm',
      // GitHub's own context for the recorded dispatch.
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_SHA: replay.acceptanceRun.headSha,
      GITHUB_RUN_ID: String(replay.acceptanceRun.id),
      // The linux-receipts job's environment.
      TAU_INSTALLER_CANDIDATE_RUN_ID: String(replay.candidateRun.id),
      DESKTOP_ASSETS_DIR: join(job, 'out', 'qualification-candidate'),
      TAU_QUALIFICATION_CHANNEL: 'staging',
      TAU_APPIMAGE_KEY_ID: replay.trust.appImageKeyId,
      TAU_APT_PRIMARY_FINGERPRINT: replay.trust.aptPrimaryFingerprint,
      TAU_APT_SIGNING_FINGERPRINT: replay.trust.aptSigningFingerprint,
    },
  };
};

const runStep = (script: string, cwd: string, env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ['--import', register, join(scripts, script)], { cwd, env, encoding: 'utf8' });

/** The download-artifact step: every desktop-route-row-* artifact of the run, each in its own directory. */
const downloadRows = (workspace: string, ids: readonly string[]): void => {
  for (const id of ids) {
    cpSync(
      join(fixtures, 'rows', `desktop-route-row-${id}`),
      join(workspace, 'out', 'qualification-rows', `desktop-route-row-${id}`),
      {
        recursive: true,
      },
    );
  }
};

const main = (): void => {
  assert.deepEqual(readdirSync(join(fixtures, 'rows')).sort(), rowIds.map((id) => `desktop-route-row-${id}`).sort());

  // The complete recorded run: re-admission then collection must produce the two vm receipts and six-row host matrix.
  {
    const { workspace, env } = prepareWorkspace();
    try {
      const fetched = runStep('fetch-desktop-installer-candidate.mts', workspace, env);
      assert.equal(fetched.status, 0, `Re-admit the exact final candidate failed:\n${fetched.stderr}`);
      downloadRows(workspace, rowIds);
      const collected = runStep('collect-qualification-rows.mts', workspace, env);
      assert.equal(collected.status, 0, `Collection failed:\n${collected.stderr}`);
      const receipts = JSON.parse(
        readFileSync(join(workspace, 'out', 'qualification-receipts', 'route-receipts.json'), 'utf8'),
      ) as Array<{
        route: string;
        tag: string;
        sourceCommit: string;
        environment: { kind: string };
        trust: { kind: string };
        suite: string;
      }>;
      assert.deepEqual(
        receipts.map((receipt) => receipt.route),
        ['linux-apt', 'linux-appimage'],
      );
      for (const receipt of receipts) {
        assert.equal(receipt.tag, 'desktop-staging@0.1.0-staging.889');
        assert.equal(receipt.sourceCommit, replay.sourceCommit);
        assert.equal(receipt.environment.kind, 'vm');
        assert.equal(receipt.trust.kind, 'release');
        assert.equal(receipt.suite, 'clean-host-route-a-b-c-v1');
      }
      const matrix = JSON.parse(
        readFileSync(join(workspace, 'out', 'qualification-receipts', 'host-matrix.json'), 'utf8'),
      ) as Array<{ id: string }>;
      assert.deepEqual(
        matrix.map(({ id }) => id),
        rowIds,
      );
    } finally {
      rmSync(join(workspace, '..'), { recursive: true, force: true });
    }
  }

  // A run missing one row (a spot-lost row that was never re-run) yields no receipts.
  {
    const { workspace, env } = prepareWorkspace();
    try {
      assert.equal(runStep('fetch-desktop-installer-candidate.mts', workspace, env).status, 0);
      downloadRows(workspace, rowIds.slice(1));
      assert.notEqual(runStep('collect-qualification-rows.mts', workspace, env).status, 0, 'five rows are refused');
    } finally {
      rmSync(join(workspace, '..'), { recursive: true, force: true });
    }
  }

  // Rows from another run do not bind to this dispatch.
  {
    const { workspace, env } = prepareWorkspace();
    try {
      assert.equal(runStep('fetch-desktop-installer-candidate.mts', workspace, env).status, 0);
      downloadRows(workspace, rowIds);
      const other = runStep('collect-qualification-rows.mts', workspace, { ...env, GITHUB_RUN_ID: '42655454144' });
      assert.notEqual(other.status, 0, 'receipts naming another run are refused');
    } finally {
      rmSync(join(workspace, '..'), { recursive: true, force: true });
    }
  }
};

/* eslint-enable @typescript-eslint/naming-convention -- End external protocol fixtures. */

try {
  main();
  console.log('linux-receipts-replay: recorded run 42706520569 replays through fetch and collection');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
