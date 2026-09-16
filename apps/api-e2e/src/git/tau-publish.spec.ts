import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { gitE2EApiUrl } from '#git/config.js';
import {
  basicAuthorization,
  deleteTauCloudOwner,
  gitE2EProjectId,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const cliEntry = resolve(workspaceRoot, 'packages/cli/dist/bin/tau.mjs');
const oxcRegister = new URL(
  'register.mjs',
  pathToFileURL(createRequire(import.meta.url).resolve('@oxc-node/core/package.json')),
).href;

const expectGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const result = await runGit(args, cwd);
  expect(result.code, `git ${args.join(' ')}: ${result.stderr}`).toBe(0);
  return result.stdout;
};

it('should publish a named graph revision through the CLI and serve its bytes to a viewer', async () => {
  const owner = await seedTauCloudOwner('publish');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'tau-publish-e2e-'));
  const projectId = gitE2EProjectId();
  const project = join(temporaryRoot, projectId);
  const tag = 'v9-e2e';
  const entryPath = 'model.scad';
  const entryBytes = 'difference() { cube(12); sphere(7); }\n';

  try {
    await seedProPlan(owner);
    await mkdir(project);
    await expectGit(['init', '-q', '--initial-branch=main', '.'], project);
    await expectGit(['config', 'user.email', 'v9@example.test'], project);
    await expectGit(['config', 'user.name', 'V9 Publish E2E'], project);
    await writeFile(join(project, entryPath), entryBytes, 'utf8');
    await writeFile(join(project, 'tau.json'), JSON.stringify({ assets: { main: { entryPath } } }), 'utf8');
    await expectGit(['add', '.'], project);
    await expectGit(['commit', '-m', 'publishable revision'], project);
    const localHead = await expectGit(['rev-parse', 'HEAD'], project);
    const revisionId = localHead.trim();

    const connected = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'V9 Publish E2E' }),
    });
    expect(connected.status, await connected.clone().text()).toBeLessThan(300);

    const environment: NodeJS.ProcessEnv = { ...process.env };
    environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
    environment['GIT_CONFIG_SYSTEM'] = '/dev/null';
    environment['GIT_TERMINAL_PROMPT'] = '0';
    environment['TAU_API_TOKEN'] = owner.token;
    environment['TAU_API_URL'] = gitE2EApiUrl;
    environment['TAU_CONFIG_DIR'] = join(temporaryRoot, 'tau-config');
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--import',
        oxcRegister,
        cliEntry,
        'publish',
        tag,
        '--project',
        project,
        '--entry',
        entryPath,
        '--public',
        '--json',
      ],
      {
        cwd: project,
        encoding: 'utf8',
        env: environment,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const publishRecord = JSON.parse(stdout) as unknown;
    expect(publishRecord).toMatchObject({
      v: 1,
      kind: 'publication',
      ok: true,
      status: 'published',
      tag,
    });
    if (
      typeof publishRecord !== 'object' ||
      publishRecord === null ||
      !('publicationId' in publishRecord) ||
      typeof publishRecord.publicationId !== 'string'
    ) {
      throw new Error('tau publish returned no publication id');
    }
    const { publicationId } = publishRecord;

    const remoteUrl = `${gitE2EApiUrl}/v1/git/${projectId}.git`;
    const remoteAdvertisement = await expectGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'ls-remote',
        remoteUrl,
        'refs/heads/main',
        `refs/tags/${tag}`,
        `refs/tags/${tag}^{}`,
      ],
      project,
    );
    const remoteReferences = new Map<string, string>();
    for (const line of remoteAdvertisement.trim().split('\n')) {
      const separator = line.indexOf('\t');
      expect(separator).toBeGreaterThan(0);
      remoteReferences.set(line.slice(separator + 1), line.slice(0, separator));
    }
    expect(remoteReferences.get('refs/heads/main')).toBe(revisionId);
    expect(remoteReferences.get(`refs/tags/${tag}^{}`)).toBe(revisionId);
    expect(remoteReferences.get(`refs/tags/${tag}`)).not.toBe(revisionId);

    const viewer = await fetch(`${gitE2EApiUrl}/v1/publications/${publicationId}`);
    expect(viewer.status, await viewer.clone().text()).toBe(200);
    const viewerRecord: unknown = await viewer.json();
    expect(viewerRecord).toMatchObject({
      publication: { projectId, tag, revisionId, visibility: 'public', entryPath },
      viewerRole: 'public',
      manifest: {
        projectId,
        entryPath,
      },
    });
    if (
      typeof viewerRecord !== 'object' ||
      viewerRecord === null ||
      !('manifest' in viewerRecord) ||
      typeof viewerRecord.manifest !== 'object' ||
      viewerRecord.manifest === null ||
      !('files' in viewerRecord.manifest) ||
      typeof viewerRecord.manifest.files !== 'object' ||
      viewerRecord.manifest.files === null ||
      !('files' in viewerRecord) ||
      typeof viewerRecord.files !== 'object' ||
      viewerRecord.files === null
    ) {
      throw new Error('publication viewer returned no graph manifest');
    }
    expect(viewerRecord.manifest.files).toHaveProperty(entryPath);
    expect(Reflect.get(viewerRecord.manifest.files, entryPath)).toMatch(/^sha256:[a-f\d]{64}$/u);
    expect(viewerRecord.files).toHaveProperty(entryPath);

    const served = await fetch(
      `${gitE2EApiUrl}/v1/publications/${publicationId}/files?path=${encodeURIComponent(entryPath)}`,
    );
    expect(served.status, await served.clone().text()).toBe(200);
    expect(await served.text()).toBe(entryBytes);
  } finally {
    await deleteTauCloudOwner(owner);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 600_000);
