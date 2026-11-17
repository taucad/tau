// @vitest-environment node
// T02: a real runtime operation, observed by the shipping page composition, is posted labelled with the page's route:
// `browser` on the web and `desktop` in the desktop renderer. A real runtime client and worker run the operations;
// only the API (`fetch`) is a test double, and every posted entry must be one the ingest admits.
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createKernelSuccess, defineKernel, nonemptyExportFiles } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { parseRuntimeEntry } from '@taucad/telemetry';
import type { DevicePreference } from '@taucad/telemetry/client';
import { createPageTelemetry } from '#telemetry/page-telemetry.js';

type Entry = Readonly<{ name: string; detail: Record<string, unknown> }>;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:page-route',
    $uses: ['JSONSchemaUnits'],
    name: 'PageRouteParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

/** A runtime client over a real in-process worker with one kernel that renders and exports. */
const createClient = () => {
  const kernel = defineKernel({
    id: 'page-route-kernel',
    extensions: ['part'] as const,
    name: 'Page route kernel',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
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
      return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async export() {
      return {
        files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('a') }]),
      };
    },
  })();
  return createRuntimeClient({
    transport: inProcessTransport({ runtime: defineRuntime({ kernels: [kernel] }), fileSystem: fromMemoryFs({}) }),
  });
};

describe('T02: a page labels each real operation with its own route', () => {
  it.each([
    ['browser', 'chromium', false],
    ['desktop', 'electron', true],
  ] as const)(
    'T02: should post route %s, platform %s, on every operation entry',
    async (route, platform, isDesktop) => {
      const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
        if (urlOf(url).endsWith('/v1/telemetry/policy')) {
          return json({ policy: 'on', maxAge: 60 });
        }
        return json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
      });
      let device: DevicePreference = 'unset';
      const page = createPageTelemetry({
        cloudBuild: true,
        isDesktop,
        apiUrl: () => 'https://api.test',
        release: () => 'abcdef012345',
        device: () => 'standard',
        platform: () => 'chromium',
        os: () => 'linux',
        globalPrivacyControl: () => false,
        readDevicePreference: () => device,
        writeDevicePreference: (value) => {
          device = value;
        },
        /* No `localStorage` (blocked site data, some embeds): the policy answer must still be kept in memory. */
        storage: () => undefined,
        notifyDesktopMain: () => undefined,
        fetch: fetch as typeof globalThis.fetch,
      });
      page.setServerPreference(true);
      page.setIdentity({ kind: 'signed-in', accountId: 'account-1' });
      const client = createClient();
      const unobserve = page.observeRuntimeClient(client, 'editor');
      const document = client.open({ source: { files: { 'model.part': 'part' } }, watch: false });
      try {
        const view = document.view('primary');
        await expect(view.rendering()).resolves.toMatchObject({ rendering: { success: true } });
        view.close();
        await expect(document.export('bom')).resolves.toMatchObject({ success: true });
      } finally {
        document.close();
        await client.shutdown();
        unobserve();
      }
      await page.flush();

      const operations = fetch.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .flatMap(([, init]) => (JSON.parse(init?.body as string) as { entries: Entry[] }).entries)
        .filter(({ name }) => name === 'runtime.operation');
      expect(operations.filter((entry) => parseRuntimeEntry(entry) === undefined)).toEqual([]);
      expect(new Set(operations.map(({ detail }) => detail['route']))).toEqual(new Set([route]));
      expect(new Set(operations.map(({ detail }) => detail['platform']))).toEqual(new Set([platform]));
      expect(new Set(operations.map(({ detail }) => detail['caller']))).toEqual(new Set(['editor']));
      expect(
        operations
          .map(({ detail }) => `${String(detail['operation'])}:${String(detail['outcome'])}`)
          .filter((attempt) => !attempt.startsWith('initialize:'))
          .sort(),
      ).toEqual(['evaluate:succeeded', 'export:succeeded', 'render:succeeded']);
    },
  );
});
