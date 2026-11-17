// T02: a real runtime operation, observed by the shipping Node host composition, reaches the API's ingest endpoint
// labelled with the host's route. Each case composes `composeNodeHostTelemetry` with the route and caller its
// production call site passes (`tau export`: `cli`/`host`; `tau mcp`: `mcp`/`agent`; the cloud host container's
// daemon: `cloud`/`agent`), observes a real runtime client and worker, and reads what a loopback API received over
// HTTP. `daemon` is in the composition's vocabulary but no shipping host composes it today (a self-hosted `tau serve`
// never reports); its case pins the label for when one does. Only the API is a test double.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createKernelSuccess, defineKernel, nonemptyExportFiles } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { parseRuntimeEntry } from '@taucad/telemetry';
import { afterEach, describe, expect, it } from 'vitest';

import { composeNodeHostTelemetry } from '#telemetry.js';
import type { ComposeNodeHostTelemetryInput } from '#telemetry.js';

type Entry = Readonly<{ name: string; detail: Record<string, unknown> }>;

let cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- cleanups run in reverse order
    await cleanup();
  }
  cleanups = [];
});

/**
 * A loopback Tau API: a signed-in session, usage metrics allowed, policy `on`, and an ingest endpoint that keeps what
 * it received.
 *
 * @returns The origin and the entries posted to `/v1/telemetry/ingest`.
 */
const startApi = async () => {
  const received: Entry[] = [];
  const reply = (response: ServerResponse, body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    request.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    request.on('end', () => {
      switch (new URL(request.url ?? '/', 'http://api').pathname) {
        case '/v1/auth/get-session': {
          reply(response, { user: { id: 'account-1' } });
          break;
        }
        case '/v1/privacy': {
          reply(response, { allowsAiTraining: false, allowsUsageMetrics: true });
          break;
        }
        case '/v1/telemetry/policy': {
          reply(response, { policy: 'on', maxAge: 900 });
          break;
        }
        case '/v1/telemetry/ingest': {
          const { entries } = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as { entries: Entry[] };
          received.push(...entries);
          reply(response, { recorded: entries.length, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
          break;
        }
        default: {
          response.writeHead(404).end();
        }
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(
    async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, received };
};

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:route',
    $uses: ['JSONSchemaUnits'],
    name: 'RouteParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

/** A kernel error carrying typed issues, as a kernel reports a refused export. */
class IssueError extends Error {
  public readonly issues: unknown[];
  public constructor(issues: unknown[]) {
    super('export refused');
    this.issues = issues;
  }
}

/**
 * A runtime client over a real worker: renders and exports `bom`; exporting `list` fails with a typed issue.
 *
 * @returns The client.
 */
const createClient = () => {
  const kernel = defineKernel({
    id: 'route-kernel',
    extensions: ['part'] as const,
    name: 'Route kernel',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: {
      bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' },
      list: { title: 'List', mimeType: 'text/plain', extension: 'txt' },
    },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters });
    },
    async evaluate() {
      return { handle: {}, views: ['primary'] as const, exports: ['bom', 'list'] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async export({ exportId }) {
      if (exportId === 'list') {
        throw new IssueError([
          { code: 'REPRESENTATION_UNSUPPORTED', type: 'kernel', severity: 'error', message: 'refused' },
        ]);
      }
      return {
        files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('a') }]),
      };
    },
  })();
  return createRuntimeClient({
    transport: inProcessTransport({ runtime: defineRuntime({ kernels: [kernel] }), fileSystem: fromMemoryFs({}) }),
  });
};

describe('T02: a Node host labels each real operation with its own route', () => {
  it.each([
    ['cli', 'host'],
    ['mcp', 'agent'],
    ['cloud', 'agent'],
    ['daemon', 'agent'],
  ] as const satisfies ReadonlyArray<readonly [ComposeNodeHostTelemetryInput['route'], string]>)(
    'T02: should deliver route %s, caller %s on every operation entry the API receives',
    async (route, caller) => {
      const api = await startApi();
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-t02-routes-'));
      cleanups.push(async () => rm(configDirectory, { recursive: true, force: true }));
      const telemetry = composeNodeHostTelemetry({
        route,
        release: '1.2.3',
        apiOrigin: api.origin,
        configDir: configDirectory,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name
        env: { TAU_AUTH_TOKEN: 'test-token' },
        readToken: async () => ({ kind: 'token', token: 'test-token' }),
        writeNotice: () => undefined,
        platform: 'linux',
      });
      telemetry.startIdentityBootstrap();
      const client = createClient();
      const unobserve = telemetry.observe(client, caller);
      const document = client.open({ source: { files: { 'model.part': 'part' } }, watch: false });
      try {
        const view = document.view('primary');
        await expect(view.rendering()).resolves.toMatchObject({ rendering: { success: true } });
        view.close();
        await expect(document.export('bom')).resolves.toMatchObject({ success: true });
        await expect(document.export('list')).resolves.toMatchObject({ success: false });
      } finally {
        document.close();
        await client.shutdown();
        unobserve();
      }
      await telemetry.shutdown();

      const operations = api.received.filter(({ name }) => name === 'runtime.operation');
      // Every entry is one the ingest admits, and every one carries this host's labels.
      expect(operations.filter((entry) => parseRuntimeEntry(entry) === undefined)).toEqual([]);
      expect(new Set(operations.map(({ detail }) => detail['route']))).toEqual(new Set([route]));
      expect(new Set(operations.map(({ detail }) => detail['caller']))).toEqual(new Set([caller]));
      expect(new Set(operations.map(({ detail }) => detail['platform']))).toEqual(new Set(['node']));
      expect(new Set(operations.map(({ detail }) => detail['os']))).toEqual(new Set(['linux']));
      // The real attempts, each once: the operation, its outcome and the client's transport.
      const work = operations.filter(({ detail }) => detail['operation'] !== 'initialize');
      const attempts = work
        .map(({ detail }) => [detail['operation'], detail['outcome'], detail['code'], detail['transport']])
        .sort((left, right) => left.join(' ').localeCompare(right.join(' ')));
      expect(attempts).toEqual([
        ['evaluate', 'succeeded', undefined, 'in-process'],
        ['export', 'issue', 'REPRESENTATION_UNSUPPORTED', 'in-process'],
        ['export', 'succeeded', undefined, 'in-process'],
        ['render', 'succeeded', undefined, 'in-process'],
      ]);
      // A kernel outside the closed vocabulary is labelled `_OTHER`, never by its own id.
      expect(new Set(work.map(({ detail }) => detail['kernel']))).toEqual(new Set(['_OTHER']));
    },
  );
});
