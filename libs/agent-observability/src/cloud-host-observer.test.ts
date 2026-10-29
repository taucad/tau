import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudHostObserver } from '#cloud-host-observer.js';
import type { ProjectedRun } from '#projection.js';
import type { OwnRowsRead } from '@taucad/agent-host';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-cloud-host-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const run: ProjectedRun = {
  chatId: 'chat-1',
  runId: 'run-1',
  termination: 'completed',
  tools: [],
  intervals: [],
  ending: { source: { chatId: 'chat-1', leaderEpoch: 'term-1', sequence: 3 }, at: Date.now() + 60_000 },
};

/* eslint-disable @typescript-eslint/naming-convention -- the provisioner's environment variables */
const provisioned = (overrides: Readonly<Record<string, string | undefined>> = {}) => ({
  TAU_API_URL: 'https://api.test/',
  TAU_HOST_DEVICE_ID: 'device-1',
  TAU_HOST_CREDENTIAL: 'device-credential',
  TAU_HOST_PROJECT_ID: 'project-1',
  TAU_HOST_OWNER_ID: 'user-1',
  TAU_CONFIG_DIR: directory,
  ...overrides,
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */

const observeTurns = async () => ({ runs: [run], ownsEpoch: () => true });
const read = vi.fn<OwnRowsRead>();

describe('cloudHostObserver', () => {
  it.each(['TAU_API_URL', 'TAU_HOST_DEVICE_ID', 'TAU_HOST_CREDENTIAL', 'TAU_HOST_PROJECT_ID', 'TAU_HOST_OWNER_ID'])(
    'should observe nothing without %s',
    async (name) => {
      const fetchMock = vi.fn<typeof fetch>();
      const observe = cloudHostObserver(provisioned({ [name]: undefined }), fetchMock, observeTurns);

      const observer = observe('project-1', read);
      observer.onChatQuiescent('chat-1', true);
      await Promise.resolve();
      observer.close();

      expect(observer).toBe(observe('project-2', read));
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should observe only the project it was provisioned for', () => {
    const fetchMock = vi.fn<typeof fetch>();
    const observe = cloudHostObserver(provisioned(), fetchMock, observeTurns);

    expect(observe('project-2', read)).toBe(observe('project-3', read));
    expect(observe('project-1', read)).not.toBe(observe('project-2', read));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should contain what composing or running the observer throws', () => {
    /* A non-string URL makes composing the reporter throw. */
    const environment = provisioned(Object.fromEntries([['TAU_API_URL', 42 as unknown as string]]));
    const observer = cloudHostObserver(environment, vi.fn<typeof fetch>())('project-1', read);

    expect(() => {
      observer.onChatQuiescent('chat-1', true);
      observer.close();
    }).not.toThrow();
  });

  it('should report under its own device and the owner’s grant, with the device credential', async () => {
    const requests: Array<Readonly<{ url: string; authorization: string | undefined; body?: string }>> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = init?.body === undefined ? undefined : await new Response(init.body).text();
      requests.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? undefined, body });
      return url.includes('/v1/telemetry-purposes')
        ? new Response(
            JSON.stringify({
              epoch: 'policy-1',
              projectId: 'project-1',
              purposes: [{ purpose: 'summary', allowed: true }],
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ receipt: 'r-1', disposition: 'accepted', duplicate: false }), {
            status: 200,
          });
    });
    const observer = cloudHostObserver(provisioned(), fetchMock, observeTurns)('project-1', read);

    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(requests.some((request) => request.body !== undefined)).toBe(true);
    });
    observer.close();

    expect(requests[0]!.url).toBe('https://api.test/v1/telemetry-purposes?projectId=project-1');
    expect(requests.every((request) => request.authorization === 'Bearer device-credential')).toBe(true);
    const envelope = JSON.parse(requests.find((request) => request.body !== undefined)!.body!) as {
      scope: { principal: string; project: string };
      delivery: { uploader: string };
      payload: { plane: string };
    };
    expect(envelope).toMatchObject({
      scope: { principal: 'user-1', project: 'project-1' },
      delivery: { uploader: 'device-1' },
      payload: { plane: 'summary' },
    });
    expect(await readdir(join(directory, 'agent-evidence'))).toEqual(['project-1.json']);
  });
});
