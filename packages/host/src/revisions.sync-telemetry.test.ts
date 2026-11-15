/**
 * Runtime observability PR-7 (AR-W6-02) on a disk host: the sync attempt reporter sends under the one consent rule.
 *
 * The host reads its consent from the Node host's runtime telemetry composition (`NodeHostTelemetry.status().consent`),
 * the same rule its runtime reporter applies, so `tau telemetry off` stops it. Only `granted` sends: `denied`, an
 * `unknown` (a signed-in account preference still loading) and a host that names no consent at all send nothing.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { ReportingConsent } from '@taucad/telemetry/client';

import { createProjectRevisions } from '#revisions.js';

const apiBaseUrl = 'https://api.test';
const projectId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const ingestUrl = `${apiBaseUrl}/v1/telemetry/ingest`;
const roots: string[] = [];
const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(releases.splice(0).map(async (release) => release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * A project on Tau Cloud whose pull answers at once, and every request the API was sent.
 *
 * @returns The directory, the port, and the requests by URL with each ingest body.
 */
const fixture = async (): Promise<
  Readonly<{ workspaceRoot: string; port: RevisionPort; requests: string[]; ingest: unknown[] }>
> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-sync-telemetry-'));
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-sync-telemetry-config-'));
  roots.push(workspaceRoot, configDirectory);
  process.env['TAU_CONFIG_DIR'] = configDirectory;
  await writeFile(
    join(workspaceRoot, 'tau.json'),
    serializeProjectManifest(
      projectToManifest({
        name: 'Alpha project',
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      }),
    ),
  );
  const real = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
  });
  await real.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const port: RevisionPort = {
    ...real,
    listRemoteRefs: async () => [],
    fetch: async () => ({ refs: [] }),
  };
  const requests: string[] = [];
  const ingest: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push(url);
    if (url === ingestUrl) {
      ingest.push(JSON.parse(typeof init?.body === 'string' ? init.body : 'null'));
    }
    return Response.json({});
  });
  return { workspaceRoot, port, requests, ingest };
};

/**
 * Open the project on Tau Cloud from a daemon whose consent the test moves.
 *
 * @param consent - The consent reader, or `undefined` for a host that names none.
 * @returns The fixture's requests and the revisions.
 */
const openWith = async (consent: (() => ReportingConsent) | undefined) => {
  const { workspaceRoot, port, requests, ingest } = await fixture();
  const revisions = createProjectRevisions({
    via: 'desktop',
    workspaceRoot,
    projectId,
    port,
    watchWorkspace: false,
    apiBaseUrl,
    tauCredential: () => ({ apiBaseUrl, authorization: 'Bearer desk' }),
    syncTelemetryPlacement: 'daemon',
    ...(consent === undefined ? {} : { syncTelemetryConsent: consent }),
  });
  releases.push(async () => revisions.release());
  await revisions.channel.request({ command: 'open' });
  await revisions.channel.request({ command: 'connectRemote', kind: 'tau' });
  return { revisions, requests, ingest };
};

describe('the disk host sync attempt reporter follows the Node host consent (runtime observability PR-7)', () => {
  it('should report a settled pull when the host consent is granted', async () => {
    const { ingest } = await openWith(() => 'granted');

    await vi.waitFor(
      () => {
        const entries = ingest.flatMap(
          (body) => (body as { entries: ReadonlyArray<{ name: string; detail: unknown }> }).entries,
        );
        expect(entries.map(({ name, detail }) => ({ name, detail }))).toContainEqual({
          name: 'observability.syncAttempt',
          detail: { direction: 'pull', outcome: 'ok', placement: 'daemon' },
        });
      },
      { timeout: 20_000 },
    );
  }, 60_000);

  it.each([
    ['denied (`tau telemetry off`)', 'denied'],
    ['unknown (the account preference is loading)', 'unknown'],
    ['not named by the host', undefined],
  ] as const)(
    'should send no sync attempt while the host consent is %s, and send once it is granted',
    async (_label, initial) => {
      let consent: ReportingConsent = initial ?? 'granted';
      const { revisions, requests, ingest } = await openWith(initial === undefined ? undefined : () => consent);

      /* The pull ran and settled: its usage read went out, and the attempt it emitted had every turn to be reported. */
      await vi.waitFor(
        () => {
          expect(requests.some((url) => url.startsWith(`${apiBaseUrl}/v1/projects/${projectId}`))).toBe(true);
        },
        { timeout: 20_000 },
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      expect(ingest).toEqual([]);

      if (initial === undefined) {
        return;
      }
      /* The reporter is alive and reads consent per attempt: a grant lets the next one through. */
      consent = 'granted';
      await revisions.channel.request({ command: 'syncNow' });
      await vi.waitFor(
        () => {
          expect(ingest).not.toEqual([]);
        },
        { timeout: 20_000 },
      );
    },
    60_000,
  );
});
