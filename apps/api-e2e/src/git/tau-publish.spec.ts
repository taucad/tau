import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';
import { projectManifestSchemaUrl, serializeProjectManifest } from '@taucad/project-core';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';

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

/** The link id in `/s/tau~shr_…`, the reference `GET /v1/shares/:shareId` reads. */
const shareIdOf = (url: string): string => {
  const slug = decodeURIComponent(new URL(url).pathname.replace(/^\/s\//u, ''));
  const reference = slug.split('~')[1] ?? '';
  expect(reference).toMatch(/^shr_[0-9A-Za-z]{21}$/u);
  return reference;
};

it('should publish to the project’s stable cloud link through the CLI, keep the link across publishes, and stop sharing', async () => {
  const owner = await seedTauCloudOwner('publish');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'tau-publish-e2e-'));
  const projectId = gitE2EProjectId();
  const project = join(temporaryRoot, projectId);
  /* B6: the version's name is free text; its tag is its number, and the project's first version is V2. */
  const versionName = 'Ready for print';
  const tag = 'v2';
  const entryPath = 'model.scad';
  const entryBytes = 'difference() { cube(12); sphere(7); }\n';

  try {
    await seedProPlan(owner);
    await mkdir(project);
    await expectGit(['init', '-q', '--initial-branch=main', '.'], project);
    await expectGit(['config', 'user.email', 'v9@example.test'], project);
    await expectGit(['config', 'user.name', 'V9 Publish E2E'], project);
    await writeFile(join(project, entryPath), entryBytes, 'utf8');
    await writeFile(
      join(project, 'tau.json'),
      serializeProjectManifest({
        $schema: projectManifestSchemaUrl,
        name: 'V9 Publish E2E',
        description: '',
        tags: [],
        assets: { main: { entryPath } },
      }),
    );
    // This fixture represents an admitted local project bound to its cloud ID.
    await mkdir(join(project, '.tau'));
    await writeFile(join(project, projectIdentityPath), serializeProjectIdentity({ version: 1, projectId }));
    await expectGit(['add', 'tau.json', entryPath], project);
    await expectGit(['commit', '-m', 'publishable revision'], project);
    const localHead = await expectGit(['rev-parse', 'HEAD'], project);
    const revisionId = localHead.trim();

    const connected = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      /* Its commit is stock git's, with no Tau record: a project linked to GitHub admits it (B4). */
      body: JSON.stringify({ name: 'V9 Publish E2E', origin: 'github' }),
    });
    expect(connected.status, await connected.clone().text()).toBeLessThan(300);

    const environment: NodeJS.ProcessEnv = { ...process.env };
    environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
    environment['GIT_CONFIG_SYSTEM'] = '/dev/null';
    environment['GIT_TERMINAL_PROMPT'] = '0';
    environment['TAU_AUTH_TOKEN'] = owner.token;
    environment['TAU_API_URL'] = gitE2EApiUrl;
    environment['TAU_CONFIG_DIR'] = join(temporaryRoot, 'tau-config');
    const publishWithCli = async (
      args: readonly string[],
    ): Promise<Readonly<{ publicationId: string; url: string; record: unknown }>> => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ['--import', oxcRegister, cliEntry, 'publish', ...args, '--project', project, '--entry', entryPath, '--json'],
        {
          cwd: project,
          encoding: 'utf8',
          env: environment,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      const record = JSON.parse(stdout) as unknown;
      if (
        typeof record !== 'object' ||
        record === null ||
        !('publicationId' in record) ||
        typeof record.publicationId !== 'string' ||
        !('url' in record) ||
        typeof record.url !== 'string'
      ) {
        throw new Error('tau publish returned no publication id or link');
      }
      return { publicationId: record.publicationId, url: record.url, record };
    };

    const first = await publishWithCli([versionName, '--public']);
    expect(first.record).toMatchObject({
      v: 1,
      kind: 'publication',
      ok: true,
      status: 'published',
      tag,
      name: versionName,
      visibility: 'public',
    });
    const { publicationId } = first;
    /* The link is the project's, `tau~shr_…`, never a version's `tau~pub_…`. */
    const shareId = shareIdOf(first.url);

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

    const viewer = await fetch(`${gitE2EApiUrl}/v1/shares/${shareId}`);
    expect(viewer.status, await viewer.clone().text()).toBe(200);
    const viewerRecord: unknown = await viewer.json();
    expect(viewerRecord).toMatchObject({
      publication: { id: publicationId, projectId, tag, revisionId, visibility: 'public', entryPath },
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

    /* An old per-version address is not a link. */
    const statusOf = async (url: string, init?: RequestInit): Promise<number> => {
      const response = await fetch(url, init);
      return response.status;
    };
    expect(await statusOf(`${gitE2EApiUrl}/v1/shares/${publicationId}`)).toBe(404);

    /* A second publish of a new revision, unnamed: the same link, its setting kept, showing the new version. */
    await writeFile(join(project, entryPath), 'cube(12);\n', 'utf8');
    await expectGit(['commit', '-am', 'second revision'], project);
    const secondHead = await expectGit(['rev-parse', 'HEAD'], project);
    const secondRevision = secondHead.trim();
    const second = await publishWithCli([]);
    expect(second.url).toBe(first.url);
    expect(second.record).toMatchObject({ status: 'published', tag: 'v3', visibility: 'public' });
    const secondName = (second.record as { name?: unknown }).name;
    expect(typeof secondName === 'string' && secondName.startsWith('Shared ')).toBe(true);
    const secondView = await fetch(`${gitE2EApiUrl}/v1/shares/${shareId}`);
    expect(secondView.status, await secondView.clone().text()).toBe(200);
    const secondRecord: unknown = await secondView.json();
    expect(secondRecord).toMatchObject({
      publication: { id: second.publicationId, tag: 'v3', revisionId: secondRevision },
    });

    /* Stop sharing: the link, a file and the view ping all answer 410 at once. */
    const stopped = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}/share`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(stopped.status, await stopped.clone().text()).toBe(204);
    expect(await statusOf(`${gitE2EApiUrl}/v1/shares/${shareId}`)).toBe(410);
    expect(
      await statusOf(
        `${gitE2EApiUrl}/v1/publications/${second.publicationId}/files?path=${encodeURIComponent(entryPath)}`,
      ),
    ).toBe(410);
    expect(await statusOf(`${gitE2EApiUrl}/v1/publications/${second.publicationId}/views`, { method: 'PATCH' })).toBe(
      410,
    );
  } finally {
    await deleteTauCloudOwner(owner);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 600_000);
