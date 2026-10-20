/**
 * The built viewer page against a real `tau mcp`, the way hosts load it.
 *
 * An MCP Apps host (the basic-host harness: `AppBridge` in Chromium, the page
 * in a sandboxed frame under its declared CSP) shows a CAD source rendered to
 * GLB and a 50 MB GLB streamed in gzipped ranges; a text host follows the loopback link.
 * Screenshots land in `TAU_E2E_EVIDENCE_DIR` when it is set.
 */

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import type { Browser, Frame, Locator, Page } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import type { TauViewerShowResult, TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import { tauViewerReadLimit } from '@taucad/mcp/viewer-protocol';

import type { HostRecord, TauHost } from '#e2e/basic-host/host.js';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load this package's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../package.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '../..');
const pagePath = join(packageRoot, 'dist-app/app.html');
const evidence = process.env['TAU_E2E_EVIDENCE_DIR'];

/** A kernel boot plus one model under tsx on a loaded runner. */
const kernelCallLimit = 300_000;

/** The `initialize` capabilities each host sends (host probes, blueprint D5). */
const mcpAppsCapabilities = {
  roots: { listChanged: true },
  extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
};
const claudeCodeCapabilities = { roots: { listChanged: true }, elicitation: { form: {}, url: {} } };

/**
 * A GLB of one wavy surface, `segments`² quads of unindexed triangles.
 *
 * @param segments - Quads along each side.
 * @returns The file's bytes.
 */
const surfaceGlb = (segments: number): Uint8Array<ArrayBuffer> => {
  const positions = new Float32Array(segments * segments * 18);
  const height = (x: number, y: number): number => Math.sin(x / 4) * Math.cos(y / 4) * 2;
  let index = 0;
  for (let x = 0; x < segments; x += 1) {
    for (let y = 0; y < segments; y += 1) {
      const scale = 40 / segments;
      /* Counter-clockwise seen from above, so the surface faces the camera. */
      for (const [dx, dy] of [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 0],
        [1, 1],
        [1, 0],
      ] as const) {
        const px = (x + dx) * scale - 20;
        const py = (y + dy) * scale - 20;
        positions[index] = px;
        positions[index + 1] = height(px, py);
        positions[index + 2] = py;
        index += 3;
      }
    }
  }
  const binary = Buffer.from(positions.buffer);
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: 'surface' }],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF's attribute name.
      meshes: [{ name: 'surface', primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length, target: 34_962 }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: positions.length / 3,
          type: 'VEC3',
          min: [-20, -2, -20],
          max: [20, 2, 20],
        },
      ],
    }),
  );
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46_54_6c_67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
  const chunkHeader = (length: number, type: number): Uint8Array<ArrayBuffer> => {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE(length, 0);
    bytes.writeUInt32LE(type, 4);
    return bytes;
  };
  return Buffer.concat([
    header,
    chunkHeader(jsonChunk.length, 0x4e_4f_53_4a),
    jsonChunk,
    chunkHeader(binary.length, 0x00_4e_49_42),
    binary,
  ]);
};

/** A closed four-faced wedge, as ASCII STL and as OBJ. */
const wedgeCorners = [
  [0, 0, 0],
  [10, 0, 0],
  [0, 10, 0],
  [0, 0, 10],
] as const;
const wedgeFaces = [
  [0, 2, 1],
  [0, 1, 3],
  [0, 3, 2],
  [1, 2, 3],
] as const;
const wedgeStl = [
  'solid wedge',
  ...wedgeFaces.flatMap((face) => [
    '  facet normal 0 0 0',
    '    outer loop',
    ...face.map((corner) => `      vertex ${wedgeCorners[corner].join(' ')}`),
    '    endloop',
    '  endfacet',
  ]),
  'endsolid wedge',
  '',
].join('\n');
const wedgeObject = [
  ...wedgeCorners.map((corner) => `v ${corner.join(' ')}`),
  ...wedgeFaces.map((face) => `f ${face.map((corner) => String(corner + 1)).join(' ')}`),
  '',
].join('\n');

let project = '';
/** The servers' Tau config folder, so their durable compute store never lands in the user's own. */
let configDirectory = '';
/** Uncaught errors in the current test's harness pages; each test expects none. */
const pageErrors: string[] = [];
let hostScript = '';
let browser: Browser | undefined;
const clients: Client[] = [];

/**
 * Start `tau mcp` as a plugin host does, serving the built page.
 *
 * @param name - The client name the host sends.
 * @param capabilities - The client's `initialize` capabilities.
 * @returns The connected client.
 */
const connect = async (name: string, capabilities: Record<string, unknown>): Promise<Client> => {
  /* Built by assignment so no environment key is a source literal. */
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env['CLAUDE_PROJECT_DIR'] = project;
  env['TAU_VIEWER_PAGE'] = pagePath;
  env['TAU_CONFIG_DIR'] = configDirectory;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', join(repoRoot, 'packages/cli/src/bin.ts'), 'mcp'],
    cwd: repoRoot,
    env,
    stderr: 'ignore',
  });
  const client = new Client({ name, version: '1.0.0' }, { capabilities });
  await client.connect(transport);
  clients.push(client);
  return client;
};

const callTool = async (client: Client, name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
  (await client.callTool({ name, arguments: args }, undefined, { timeout: kernelCallLimit })) as CallToolResult;

const shown = (result: CallToolResult): TauViewerShowResult => {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as TauViewerShowResult;
};

const capture = async (page: Page, name: string): Promise<void> => {
  if (evidence === undefined) {
    return;
  }
  /* The sandboxed frame paints in its own process; with a software
   * rasterizer a screenshot can show its first frame long after it changed.
   * Evidence waits, then forces a layout in every frame. Assertions never
   * wait on paint. */
  await page.waitForTimeout(1000);
  for (const frame of page.frames()) {
    // oxlint-disable-next-line no-await-in-loop -- one frame at a time.
    await frame.evaluate(() => document.body.innerText.length); // oxlint-disable-line unicorn/prefer-dom-node-text-content -- reading innerText forces the layout.
  }
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`) });
};

/** The page frame inside the harness. */
const viewerFrame = (page: Page): Frame => {
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  if (frame === undefined) {
    throw new Error('The harness has no viewer frame.');
  }
  return frame;
};

/**
 * The harness host: its display mode, and how it differs from the default (what it declares, the height it allows,
 * the replies it gives in place of the server's).
 */
type HarnessHost = Readonly<{
  displayMode: 'inline' | 'fullscreen';
  hostCapabilities?: Parameters<TauHost['mount']>[0]['hostCapabilities'];
  maxHeight?: number;
  /** A reply to a call the test answers itself, or `undefined` to forward the call to the server. */
  answer?: (name: string) => CallToolResult | undefined;
}>;

/**
 * Mount the page in the basic-host harness with one tool result, or as a view the person opened.
 *
 * @param client - The MCP Apps client.
 * @param result - The `show_model` result the host hands the page; `undefined` for a view without one (a thread tab).
 * @param host - The host's display mode, what it declares and the height it allows.
 * @returns The harness page.
 */
const mountInHarness = async (client: Client, result: CallToolResult | undefined, host: HarnessHost): Promise<Page> => {
  const { displayMode } = host;
  const maxHeight = host.maxHeight ?? 640;
  const { tools } = await client.listTools();
  const showModel = tools.find((tool) => tool.name === 'show_model');
  if (showModel === undefined) {
    throw new Error('The server lists no show_model.');
  }
  const { resourceUri } = (showModel._meta?.['ui'] ?? {}) as { resourceUri: string };
  const { contents } = await client.readResource({ uri: resourceUri });
  const { resources } = await client.listResources();
  const listed = resources.find((resource) => resource.uri === resourceUri);
  const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
  /* Closed when its test ends, passed or failed, so it reports nothing into a later test. */
  onTestFinished(async () => page.close());
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.exposeFunction(
    'tauCallTool',
    async (name: string, args: Record<string, unknown>) => host.answer?.(name) ?? callTool(client, name, args),
  );
  await page.setContent(
    `<!doctype html><html><body style="margin:0"><script type="module">${hostScript}</script></body></html>`,
  );
  const content = contents[0];
  if (content === undefined || !('text' in content)) {
    throw new Error('The viewer resource has no text.');
  }
  const options: Parameters<TauHost['mount']>[0] = {
    html: content.text,
    csp: (listed?._meta?.['ui'] as { csp?: Parameters<TauHost['mount']>[0]['csp'] } | undefined)?.csp,
    hostContext: {
      theme: 'light',
      displayMode,
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: { maxHeight },
      platform: 'desktop',
      /* A view opened by a tool call knows that call (ext-apps `toolInfo`); one the person opened does not. */
      ...(result === undefined ? {} : { toolInfo: { id: 'show-call', tool: showModel } }),
    },
    ...(host.hostCapabilities === undefined ? {} : { hostCapabilities: host.hostCapabilities }),
    toolArguments: {},
    toolResult: result,
    width: 860,
    /* The frame is as tall as the card or the host's cap, whichever is lower. */
    height: Math.min(420, maxHeight),
  };
  await page.evaluate(async (mount) => {
    await globalThis.tauHost.mount(mount);
  }, options);
  return page;
};

/**
 * Wait until the page draws a model: the preview is up and an action that needs the model is live.
 *
 * @param root - The frame or page the viewer is in.
 * @param action - The card's reference action, or `Export` in the tab's header.
 */
const drawn = async (root: Frame | Page, action: string): Promise<void> => {
  await root.getByRole('img', { name: '3D model preview' }).waitFor({ timeout: 120_000 });
  await root.locator('canvas').waitFor();
  await expect
    .poll(async () => root.getByRole('button', { name: action, exact: true }).isEnabled(), { timeout: 120_000 })
    .toBe(true);
};

/**
 * Check the tab's chrome against the desktop's (VUI-1, VUI-2): the bar ends with Viewer settings, the canvas header
 * carries Share and Export, and the one workbench toggle ends the top row: in the lane's header beside its tabs while
 * the lane is open, in the canvas header while it is closed. The toggle hides and shows the lane, and Export opens its
 * pane.
 *
 * @param root - The frame or page the viewer is in, drawn in the tab composition.
 * @param isOpenAtLoad - Whether the lane is open when the page loads (the tab is at least 720 px wide).
 */
const checkTabChrome = async (root: Frame | Page, isOpenAtLoad: boolean): Promise<void> => {
  const bar = root.getByRole('group', { name: 'Viewer controls' });
  const barSnapshot = await bar.ariaSnapshot();
  expect(barSnapshot.trimEnd()).toMatch(/- button "Viewer settings"$/u);
  for (const name of ['Add to chat', 'Send to chat', 'Copy reference', 'Hide panes', 'Show panes', 'Hide workbench']) {
    // oxlint-disable-next-line no-await-in-loop -- one name at a time.
    expect(await root.getByRole('button', { name, exact: true }).count()).toBe(0);
  }
  const header = root.getByRole('group', { name: 'Workbench actions' });
  /* One toggle on the page, wherever the row ends. */
  const toggle = root.getByRole('button', { name: 'Toggle Workbench lane' });
  const lane = root.getByRole('complementary', { name: 'Workbench' });
  const closedHeader = [
    '- group "Workbench actions":',
    '  - button "Share"',
    '  - button "Export"',
    '  - button "Toggle Workbench lane"',
  ].join('\n');
  expect(await lane.count()).toBe(isOpenAtLoad ? 1 : 0);
  expect(await toggle.count()).toBe(1);

  if (isOpenAtLoad) {
    expect(await header.ariaSnapshot()).toBe(
      ['- group "Workbench actions":', '  - button "Share"', '  - button "Export"'].join('\n'),
    );
    expect(await lane.getByRole('button', { name: 'Toggle Workbench lane' }).getAttribute('aria-pressed')).toBe('true');
    /* The lane's tabs share the canvas header's row: one top row, no second row of tabs. */
    const headerBox = await header.boundingBox();
    const tabsBox = await lane.getByRole('tablist', { name: 'Open panes' }).boundingBox();
    expect(
      Math.abs((headerBox?.y ?? 0) + (headerBox?.height ?? 0) / 2 - ((tabsBox?.y ?? 0) + (tabsBox?.height ?? 0) / 2)),
    ).toBeLessThan(2);
    await toggle.click();
    await expect.poll(async () => lane.count()).toBe(0);
    expect(await toggle.getAttribute('aria-pressed')).toBe('false');
  }
  expect(await header.ariaSnapshot()).toBe(closedHeader);
  /* Export opens the closed lane on its pane. */
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  await lane.getByRole('tabpanel', { name: 'Export' }).waitFor();
  expect(await toggle.getAttribute('aria-pressed')).toBe('true');
  await header.getByRole('button', { name: 'Share', exact: true }).click();
  await lane.getByRole('tabpanel', { name: 'Share' }).waitFor();
  await toggle.click();
  await expect.poll(async () => lane.count()).toBe(0);
};

/**
 * Open a pane from the lane's tab menu.
 *
 * @param root - The frame or page the viewer is in.
 * @param pane - The pane's name.
 * @returns The pane's panel.
 */
const openPane = async (root: Frame | Page, pane: string): Promise<Locator> => {
  const lane = root.getByRole('complementary', { name: 'Workbench' });
  await lane.getByRole('button', { name: 'Open workbench tab' }).click();
  await root.getByRole('menuitem', { name: pane }).click();
  const panel = lane.getByRole('tabpanel', { name: pane });
  await panel.waitFor();
  return panel;
};

/**
 * Read one field of what the harness host recorded.
 *
 * @param page - The harness page.
 * @param key - The field.
 * @returns Its current value.
 */
const recorded = async <Key extends keyof HostRecord>(page: Page, key: Key): Promise<HostRecord[Key]> => {
  const record = await page.evaluate(() => globalThis.tauHost.record);
  return record[key];
};

/**
 * The browser `beforeAll` launched.
 *
 * @returns The launched browser.
 */
const launched = (): Browser => {
  if (!browser) {
    throw new Error('The browser did not launch.');
  }
  return browser;
};

beforeAll(async () => {
  await readFile(pagePath);
  project = await mkdtemp(join(tmpdir(), 'viewer-page-e2e-'));
  configDirectory = await mkdtemp(join(tmpdir(), 'viewer-page-e2e-config-'));
  await writeFile(
    join(project, 'main.ts'),
    `import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);\n}\n`,
  );
  await writeFile(
    join(project, 'plate.ts'),
    `import { drawRectangle } from 'replicad';\n\nexport const defaultParams = { width: 20 };\n\nexport default function main(params: typeof defaultParams) {\n  return drawRectangle(params.width, 10).sketchOnPlane('XY').extrude(2);\n}\n`,
  );
  await writeFile(join(project, 'surface.glb'), surfaceGlb(850));
  /* Exchange formats the server converts to GLB (W7). */
  await copyFile(join(here, 'fixtures/intersecting-cylinders.step'), join(project, 'cylinders.step'));
  await writeFile(join(project, 'wedge.stl'), wedgeStl);
  await writeFile(join(project, 'wedge.obj'), wedgeObject);
  await writeFile(join(project, 'small.glb'), surfaceGlb(8));
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      /* An ES module: Rolldown's IIFE output hoists zod's lazy locale init out of scope (`init_locales is not
       * defined`), so the harness ran no code and every test failed before mounting. */
      lib: { entry: join(here, 'basic-host/host.ts'), formats: ['es'], name: 'tauBasicHost' },
    },
  });
  /* One library build without a watcher: one output whose first file is the module. */
  const [first] = [output].flat() as Array<{ output?: ReadonlyArray<{ code?: unknown }> }>;
  const code = first?.output?.[0]?.code;
  if (typeof code !== 'string') {
    throw new TypeError('The basic-host harness did not build.');
  }
  hostScript = code.replaceAll('</script', String.raw`<\/script`);
  browser = await chromium.launch({
    /* A machine whose Chromium is not the one this Playwright pins names its own. */
    executablePath: process.env['TAU_E2E_CHROMIUM'],
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}, kernelCallLimit);

afterAll(async () => {
  /* A setup failure leaves no browser to close. */
  await browser?.close();
  for (const client of clients) {
    // oxlint-disable-next-line no-await-in-loop -- each server stops before the project is removed.
    await client.close();
  }
  await rm(project, { recursive: true, force: true });
  await rm(configDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  pageErrors.length = 0;
});

describe('the viewer page in an MCP Apps host', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect('claude-ai', mcpAppsCapabilities);
  });

  it(
    'should draw a CAD source as an inline card with two actions, then the tab composition',
    async () => {
      const result = await callTool(client, 'show_model', { targetFile: 'main.ts' });
      expect(shown(result).model).toMatchObject({ sourceFile: 'main.ts', mimeType: 'model/gltf-binary' });
      const page = await mountInHarness(client, result, { displayMode: 'inline' });
      const frame = viewerFrame(page);

      await drawn(frame, 'Add to chat');
      expect(await frame.getByRole('group', { name: 'Viewer controls' }).count()).toBe(0);
      const addToChat = frame.getByRole('button', { name: 'Add to chat' });
      const openFullView = frame.getByRole('button', { name: 'Open full view' });
      expect(await addToChat.isVisible()).toBe(true);
      expect(await openFullView.isVisible()).toBe(true);
      await capture(page, 'basic-host-inline');

      /* Besides its live link (app_sync), the card reads only its model. */
      const openingCalls = await recorded(page, 'toolCalls');
      expect(openingCalls.map((call) => call.name).filter((name) => name !== 'app_sync')).toEqual(['app_read']);

      await addToChat.click();
      await expect.poll(async () => recorded(page, 'modelContext')).toHaveLength(1);
      expect(JSON.stringify(await recorded(page, 'modelContext'))).toContain('main');

      await openFullView.click();
      await expect.poll(async () => recorded(page, 'displayModeRequests')).toEqual(['fullscreen']);
      await frame.getByRole('group', { name: 'Viewer controls' }).waitFor();
      expect(await frame.getByRole('button', { name: 'Open full view' }).count()).toBe(0);
      await capture(page, 'basic-host-fullscreen');
      await checkTabChrome(frame, true);

      await page.evaluate(() => {
        globalThis.tauHost.setHostContext({ theme: 'dark' });
      });
      await expect
        .poll(async () => frame.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(true);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should send the reference as a message on a host that takes no model context',
    async () => {
      const result = await callTool(client, 'show_model', { targetFile: 'small.glb' });
      const page = await mountInHarness(client, result, {
        displayMode: 'inline',
        hostCapabilities: { serverTools: {}, message: { text: {} } },
      });
      const frame = viewerFrame(page);

      await drawn(frame, 'Send to chat');
      await frame.getByRole('button', { name: 'Send to chat' }).click();
      await expect.poll(async () => recorded(page, 'messages')).toHaveLength(1);
      await frame.getByRole('status').filter({ hasText: 'Sent to chat' }).waitFor();
      expect(JSON.stringify(await recorded(page, 'messages'))).toContain('small');
      expect(await recorded(page, 'modelContext')).toEqual([]);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should keep both card actions inside a host height cap below the card height',
    async () => {
      const result = await callTool(client, 'show_model', { targetFile: 'small.glb' });
      const page = await mountInHarness(client, result, { displayMode: 'inline', maxHeight: 300 });
      const frame = viewerFrame(page);

      await drawn(frame, 'Add to chat');
      const frameBox = await page.locator('iframe').boundingBox();
      expect(frameBox).not.toBeNull();
      for (const name of ['Add to chat', 'Open full view']) {
        // oxlint-disable-next-line no-await-in-loop -- one action at a time.
        const box = await frame.getByRole('button', { name }).boundingBox();
        expect(box).not.toBeNull();
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((frameBox?.y ?? 0) + (frameBox?.height ?? 0));
      }
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should stream a 50 MB GLB in gzipped ranges no larger than one reply',
    async () => {
      const result = await callTool(client, 'show_model', { targetFile: 'surface.glb' });
      const { model } = shown(result);
      expect(model.byteLength).toBeGreaterThan(50 * 1000 * 1000);
      const page = await mountInHarness(client, result, { displayMode: 'fullscreen' });
      const frame = viewerFrame(page);

      await drawn(frame, 'Export');
      const calls = await recorded(page, 'toolCalls');
      const reads = calls.filter((call) => call.name === 'app_read');
      expect(reads.length).toBe(Math.ceil(model.byteLength / tauViewerReadLimit));
      expect(reads.every((call) => Number(call.arguments['length']) <= tauViewerReadLimit)).toBe(true);
      expect(reads.every((call) => JSON.stringify(call.arguments['encodings']) === '["gzip"]')).toBe(true);
      await capture(page, 'basic-host-50mb');
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );
});

describe('exchange formats (W7)', () => {
  it(
    'should convert STEP, STL and OBJ files to GLB on the server and draw them',
    async () => {
      const client = await connect('claude-ai', mcpAppsCapabilities);
      for (const targetFile of ['cylinders.step', 'wedge.stl', 'wedge.obj']) {
        // oxlint-disable-next-line no-await-in-loop -- one kernel conversion at a time.
        const { model } = shown(await callTool(client, 'show_model', { targetFile }));
        expect(model).toMatchObject({ sourceFile: targetFile, mimeType: 'model/gltf-binary' });
        expect(model.path).toMatch(/^\.tau\/artifacts\/.+\.glb$/u);
      }
      const result = await callTool(client, 'show_model', { targetFile: 'cylinders.step' });
      const page = await mountInHarness(client, result, { displayMode: 'fullscreen' });
      await drawn(viewerFrame(page), 'Export');
      await capture(page, 'step-converted');
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );
});

describe('a moving assembly (LRP-9)', () => {
  /** The fixture's one animation, as its `mechanism` export declares it. */
  const animation = { id: 'four-sun-turns', name: 'Four sun turns' };

  beforeAll(async () => {
    await copyFile(join(here, 'fixtures/planetary/main.ts'), join(project, 'planetary.ts'));
  });

  /**
   * Show the planetary source and check what reaches the page: `evaluate_model` declares and admits the mechanism,
   * the shown GLB carries `TAU_cad_topology` and `show_model` reports it preserved.
   *
   * @param client - The connected client.
   * @returns The `show_model` result.
   */
  const showPlanetary = async (client: Client): Promise<CallToolResult> => {
    const evaluated = await callTool(client, 'evaluate_model', { targetFile: 'planetary.ts' });
    expect(evaluated.isError).toBeFalsy();
    expect(evaluated.structuredContent).toMatchObject({
      mechanism: { declared: true, admitted: true, links: 4, joints: 3, couplings: 1, animations: [animation.id] },
    });

    const showResult = await callTool(client, 'show_model', { targetFile: 'planetary.ts' });
    const result = shown(showResult);
    expect(result.model).toMatchObject({ sourceFile: 'planetary.ts', mimeType: 'model/gltf-binary' });
    /* The GLB's JSON chunk: its length at byte 12, its text from byte 20. */
    const glb = await readFile(join(project, result.model.path));
    const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as {
      extensionsUsed?: readonly string[];
      extensions?: Record<string, { topologyBufferView?: number }>;
    };
    expect(gltf.extensionsUsed ?? []).toContain('TAU_cad_topology');
    expect(gltf.extensions?.['TAU_cad_topology']?.topologyBufferView).toEqual(expect.any(Number));
    expect(result.mechanism).toEqual({ preserved: true, joints: 3, animations: [animation.id] });
    return showResult;
  };

  /**
   * Open the Kinematics pane and check that its animation picker lists the fixture's animation.
   *
   * @param root - The frame or page the viewer is in, drawn in the tab composition with the lane open.
   */
  const checkKinematicsPane = async (root: Frame | Page): Promise<void> => {
    const lane = root.getByRole('complementary', { name: 'Workbench' });
    await lane.getByRole('tab', { name: 'Kinematics' }).click();
    const panel = lane.getByRole('tabpanel', { name: 'Kinematics' });
    await panel.getByRole('group', { name: 'Playback' }).waitFor({ timeout: 60_000 });
    await panel.getByRole('button', { name: /^Animation: /u }).click();
    await root.getByRole('option', { name: animation.name }).waitFor();
  };

  it(
    'should carry the mechanism to the page in an MCP Apps host',
    async () => {
      const client = await connect('claude-ai', mcpAppsCapabilities);
      const result = await showPlanetary(client);
      const page = await mountInHarness(client, result, { displayMode: 'fullscreen' });
      const frame = viewerFrame(page);
      await drawn(frame, 'Export');
      await checkKinematicsPane(frame);
      await capture(page, 'basic-host-kinematics');
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should carry the mechanism to the loopback page of a text host',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await showPlanetary(client));
      const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');
      await checkKinematicsPane(page);
      await capture(page, 'loopback-kinematics');
      await page.close();
    },
    kernelCallLimit,
  );
});

describe("the tab's panels (W10)", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect('claude-ai', mcpAppsCapabilities);
  });

  it(
    "should open the workbench panes, write a parameter edit Tau reads, and keep the page's view in the project",
    async () => {
      const first = await callTool(client, 'show_model', { targetFile: 'plate.ts' });
      const page = await mountInHarness(client, first, { displayMode: 'fullscreen' });
      const frame = viewerFrame(page);
      await drawn(frame, 'Export');
      const panels = frame.getByRole('complementary', { name: 'Workbench' });
      await panels.waitFor();
      const before = (first.structuredContent as { model: { id: string } }).model.id;

      const width = panels.getByRole('tabpanel', { name: 'Parameters' }).getByRole('spinbutton', { name: /Width/u });
      await width.waitFor({ timeout: 60_000 });
      await width.fill('30');
      await width.press('Enter');

      await expect
        .poll(async () => readFile(join(project, '.tau/parameters/plate.ts.json'), 'utf8').catch(() => ''), {
          timeout: 60_000,
        })
        .toContain('30');
      await expect
        .poll(
          async () => {
            const result = await callTool(client, 'view_state', {});
            return (result.structuredContent as { view: TauViewerViewState }).view.model.id;
          },
          { timeout: 120_000 },
        )
        .not.toBe(before);

      /* Right-clicking a part opens the app's part menu (viewer parity V13). */
      const canvas = frame.locator(`#tau-viewer-canvas canvas`).first();
      const box = await canvas.boundingBox();
      if (box === null) {
        throw new Error('The canvas has no box.');
      }
      await frame.locator('#tau-viewer-canvas').click({
        button: 'right',
        position: { x: box.width / 2, y: box.height / 2 },
      });
      const partMenu = frame.getByRole('menu');
      await partMenu.waitFor({ timeout: 30_000 });
      expect(await partMenu.getByRole('menuitem', { name: /Isolate/u }).count()).toBe(1);
      await capture(page, 'part-menu');
      await page.keyboard.press('Escape');

      /* The person hides a component; Tau opens the project with the page's camera and that display (Q14). */
      await panels.getByRole('tab', { name: 'Model' }).click();
      await panels
        .getByRole('tabpanel', { name: 'Model' })
        .getByRole('button', { name: /^Hide / })
        .first()
        .click();
      let hidden: readonly string[] = [];
      await expect
        .poll(
          async () => {
            const result = await callTool(client, 'view_state', {});
            ({ hidden } = (result.structuredContent as { view: TauViewerViewState }).view);
            return hidden.length;
          },
          { timeout: 30_000 },
        )
        .toBe(1);
      const workbenchRecord = async (path: string): Promise<unknown> =>
        JSON.parse(await readFile(join(project, '.tau/workbench', path), 'utf8')) as unknown;
      await expect
        .poll(async () => workbenchRecord('entries.json').catch(() => undefined), { timeout: 30_000 })
        .toMatchObject({ entries: { 'plate.ts': { components: { hidden } } } });
      const layout = (await workbenchRecord('layout.json')) as {
        viewer: { tabs: ReadonlyArray<{ view: string }> };
      };
      const views = await Promise.all(
        layout.viewer.tabs.map(async ({ view: id }) => workbenchRecord(`views/${id}.json`)),
      );
      expect(
        views.map((record) => {
          const { entryPath, camera } = record as { entryPath: string; camera: { kind: string } };
          return { entryPath, camera: camera.kind };
        }),
      ).toContainEqual({ entryPath: 'plate.ts', camera: 'pose' });
      await capture(page, 'panels');
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should say why Export lists no formats: a server without the tool, or a failure it can retry',
    async () => {
      const shownMain = await callTool(client, 'show_model', { targetFile: 'main.ts' });
      const { version } = packageJson;

      /* A `tau` from before the formats tool: the MCP SDK's answer to a tool the server does not serve. */
      const older = await mountInHarness(client, shownMain, {
        displayMode: 'fullscreen',
        answer: (name) =>
          name === 'app_export_formats'
            ? { isError: true, content: [{ type: 'text', text: `MCP error -32602: Tool ${name} not found` }] }
            : undefined,
      });
      await drawn(viewerFrame(older), 'Export');
      const olderPanel = await openPane(viewerFrame(older), 'Export');
      const mismatch = olderPanel.getByRole('alert', { name: 'Export formats could not be loaded' });
      await expect
        .poll(async () => mismatch.textContent())
        .toContain(
          `This Tau server has no export formats; plugin ${version} needs the same version: npm install -g @taucad/cli@${version}, then restart the Tau server or your agent`,
        );
      expect(await mismatch.getByRole('button').count()).toBe(0);
      await capture(older, 'export-older-server');
      await older.close();

      /* A failure the server reports, then a retry it answers. */
      let isFailing = true;
      const failing = await mountInHarness(client, shownMain, {
        displayMode: 'fullscreen',
        answer: (name) =>
          name === 'app_export_formats' && isFailing
            ? { isError: true, content: [{ type: 'text', text: 'NO_KERNEL: No kernel exports main.ts.' }] }
            : undefined,
      });
      await drawn(viewerFrame(failing), 'Export');
      const panel = await openPane(viewerFrame(failing), 'Export');
      const failure = panel.getByRole('alert', { name: 'Export formats could not be loaded' });
      await expect.poll(async () => failure.textContent()).toContain('No kernel exports main.ts.');
      await capture(failing, 'export-retry');
      isFailing = false;
      await failure.getByRole('button', { name: 'Retry' }).click();
      await panel.getByRole('region', { name: 'Formats' }).waitFor({ timeout: 60_000 });
      expect(await panel.getByRole('checkbox', { name: 'Save to project' }).isChecked()).toBe(true);
      expect(pageErrors).toEqual([]);
      await failing.close();
    },
    kernelCallLimit,
  );
});

describe('the live view (W6)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect('claude-ai', mcpAppsCapabilities);
  });

  it(
    'should keep a card on its model in fullscreen when another show_model follows',
    async () => {
      const cardClient = await connect('claude-ai', mcpAppsCapabilities);
      const first = await callTool(cardClient, 'show_model', { targetFile: 'main.ts' });
      const page = await mountInHarness(cardClient, first, { displayMode: 'fullscreen' });
      await drawn(viewerFrame(page), 'Export');
      /* The card reports its view once its model is drawn, which can land after its actions are live. */
      await expect
        .poll(
          async () => {
            const state = await callTool(cardClient, 'view_state', {});
            return state.isError;
          },
          { timeout: 120_000 },
        )
        .toBeFalsy();

      /* Another conversation of the same server shows a model; a capture round trip proves the card synced since. */
      await callTool(cardClient, 'show_model', { targetFile: 'surface.glb' });
      const captured = await callTool(cardClient, 'view_state', { capture: true });
      expect(captured.isError).toBeFalsy();
      expect(captured.content.some((block) => block.type === 'image')).toBe(true);
      const { view } = captured.structuredContent as { view: TauViewerViewState };
      expect(view.model).toMatchObject({ sourceFile: 'main.ts' });
      const calls = await recorded(page, 'toolCalls');
      const reads = calls.filter((call) => call.name === 'app_read');
      expect(new Set(reads.map((call) => call.arguments['modelId']))).toEqual(new Set([shown(first).model.id]));
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    "should follow show_model in the tab, report the selection, apply the agent's selection and capture the view",
    async () => {
      await callTool(client, 'show_model', { targetFile: 'main.ts' });
      /* A thread tab opens without a tool result and follows what the agent shows. */
      const page = await mountInHarness(client, undefined, { displayMode: 'fullscreen' });
      const frame = viewerFrame(page);
      await drawn(frame, 'Export');

      /* The person picks the box in the middle of the canvas. */
      const canvasBox = await frame.locator('canvas').first().boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.click(
        (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2,
        (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) / 2,
      );
      const viewOf = async (args: Record<string, unknown> = {}) => {
        const result = await callTool(client, 'view_state', args);
        expect(result.isError).toBeFalsy();
        return result;
      };
      const viewNow = async (): Promise<TauViewerViewState> => {
        const result = await viewOf();
        return (result.structuredContent as { view: TauViewerViewState }).view;
      };
      await expect
        .poll(
          async () => {
            const current = await viewNow();
            return current.selected.length;
          },
          {
            timeout: 30_000,
          },
        )
        .toBeGreaterThan(0);
      const view = await viewNow();
      expect(view).toMatchObject({ composition: 'tab', model: { sourceFile: 'main.ts' } });
      expect(view.camera?.verticalSpan).toBeGreaterThan(0);
      const [picked] = view.selected;

      /* A click on empty space clears the selection; the agent then selects the same component through show_model. */
      await page.mouse.click((canvasBox?.x ?? 0) + 12, (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) / 2);
      await expect
        .poll(
          async () => {
            const current = await viewNow();
            return current.selected;
          },
          {
            timeout: 30_000,
          },
        )
        .toEqual([]);
      await callTool(client, 'show_model', { targetFile: 'main.ts', select: [picked?.componentId] });
      await expect
        .poll(
          async () => {
            const current = await viewNow();
            return current.selected;
          },
          {
            timeout: 30_000,
          },
        )
        .toEqual([picked]);

      const captured = await viewOf({ capture: true });
      const image = captured.content.find((block) => block.type === 'image');
      expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' });
      expect(
        Buffer.from(image?.type === 'image' ? image.data : '', 'base64')
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      if (evidence !== undefined && image?.type === 'image') {
        await mkdir(evidence, { recursive: true });
        await writeFile(join(evidence, 'live-capture.png'), Buffer.from(image.data, 'base64'));
      }

      /* A new model replaces the one the tab shows. */
      await callTool(client, 'show_model', { targetFile: 'surface.glb' });
      await expect
        .poll(
          async () => {
            const current = await viewNow();
            return current.model.path;
          },
          {
            timeout: 120_000,
          },
        )
        .toBe('surface.glb');
      await capture(page, 'live-follow');
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );
});

describe('Add to chat on each route (VUI-3)', () => {
  /** Two named parts, so the person can add one, then the other. */
  const pairSource = `import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  return [\n    { shape: drawRectangle(10, 10).sketchOnPlane('XY').extrude(4), name: 'Left' },\n    { shape: drawRectangle(10, 10).sketchOnPlane('XY').extrude(4).translate(20, 0, 0), name: 'Right' },\n  ];\n}\n`;

  beforeAll(async () => {
    await writeFile(join(project, 'pair.ts'), pairSource);
  });

  /**
   * Add one part from its row's menu in the Model pane, the same menu the canvas opens.
   *
   * @param root - The frame or page the viewer is in, with the lane open.
   * @param part - The part's name.
   * @param item - The chat item's label on this route.
   */
  const addPart = async (root: Frame | Page, part: string, item: string): Promise<void> => {
    const lane = root.getByRole('complementary', { name: 'Workbench' });
    await lane.getByRole('tab', { name: 'Model' }).click();
    const actions = lane.getByRole('tabpanel', { name: 'Model' }).getByRole('button', { name: `Actions for ${part}` });
    await actions.waitFor({ timeout: 60_000 });
    await actions.click();
    const menu = root.getByRole('menu');
    expect(await menu.getByRole('menuitem', { name: 'Add to chat' }).count()).toBe(item === 'Add to chat' ? 1 : 0);
    await menu.getByRole('menuitem', { name: item }).click();
  };

  it(
    'should hand model context every part added, in order, on a host that takes it',
    async () => {
      const client = await connect('claude-ai', mcpAppsCapabilities);
      const result = await callTool(client, 'show_model', { targetFile: 'pair.ts' });
      const page = await mountInHarness(client, result, { displayMode: 'fullscreen' });
      const frame = viewerFrame(page);
      await drawn(frame, 'Export');

      await addPart(frame, 'Left', 'Add to chat');
      await frame.getByRole('status').filter({ hasText: 'Added to chat (1)' }).waitFor();
      await addPart(frame, 'Right', 'Add to chat');
      await frame.getByRole('status').filter({ hasText: 'Added to chat (2)' }).waitFor();

      const updates = (await recorded(page, 'modelContext')) as ReadonlyArray<{
        content: ReadonlyArray<{ text: string }>;
        structuredContent: { references: ReadonlyArray<{ target: { label: string } }> };
      }>;
      expect(updates).toHaveLength(2);
      const last = updates.at(-1);
      expect(last?.structuredContent.references.map((reference) => reference.target.label)).toEqual(['Left', 'Right']);
      expect(last?.content[0]?.text).toMatch(/^Left, Right in pair @cad\[pair\.ts#[^\]]+\] @cad\[pair\.ts#[^\]]+\]$/u);
      expect(await recorded(page, 'messages')).toEqual([]);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should send one part as a message on a host that takes no model context',
    async () => {
      const client = await connect('claude-ai', mcpAppsCapabilities);
      const result = await callTool(client, 'show_model', { targetFile: 'pair.ts' });
      const page = await mountInHarness(client, result, {
        displayMode: 'fullscreen',
        hostCapabilities: { serverTools: {}, message: { text: {} } },
      });
      const frame = viewerFrame(page);
      await drawn(frame, 'Export');

      await addPart(frame, 'Left', 'Send to chat');
      await frame.getByRole('status').filter({ hasText: 'Sent to chat' }).waitFor();
      const messages = await recorded(page, 'messages');
      expect(messages).toHaveLength(1);
      expect(JSON.stringify(messages).match(/@cad\[/gu)).toHaveLength(1);
      expect(await recorded(page, 'modelContext')).toEqual([]);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should copy the reference on the loopback page and report the added part to view_state',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'pair.ts' }));
      const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(viewerUrl ?? '').origin,
      });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');

      await addPart(page, 'Left', 'Copy reference');
      await page.getByRole('status').filter({ hasText: 'Copied; paste it into your chat' }).waitFor();
      const copied = await page.evaluate(async () => navigator.clipboard.readText());
      expect(copied).toMatch(/^Left in pair @cad\[pair\.ts#[^\]]+\]$/u);

      /* Without a paste the agent still finds the part: the page reported it with its next sync. */
      let text = '';
      await expect
        .poll(
          async () => {
            const state = await callTool(client, 'view_state', {});
            text = state.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
            return text;
          },
          { timeout: 30_000 },
        )
        .toMatch(/^Added to chat: Left \(/mu);
      const componentId = /^Added to chat: Left \(([^)]+)\)\.$/mu.exec(text)?.[1];
      expect(copied).toBe(`Left in pair @cad[pair.ts#${componentId ?? ''}]`);
      await page.close();
    },
    kernelCallLimit,
  );
});

describe('the part menu from the keyboard (VUI-6)', () => {
  /** A wide part at the framed centre, so a right press there lands on it, and a narrow one beside it. */
  const keysSource = `import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  return [\n    { shape: drawRectangle(40, 20).sketchOnPlane('XY').extrude(4), name: 'Wide' },\n    { shape: drawRectangle(10, 10).sketchOnPlane('XY').extrude(4).translate(35, 0, 0), name: 'Narrow' },\n  ];\n}\n`;

  beforeAll(async () => {
    await writeFile(join(project, 'keys.ts'), keysSource);
  });

  /**
   * Open the loopback page on `keys.ts`, wide enough that the lane opens with it.
   *
   * @returns The client and the drawn page.
   */
  const openKeys = async (): Promise<Readonly<{ client: Client; page: Page }>> => {
    const client = await connect('claude-code', claudeCodeCapabilities);
    const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'keys.ts' }));
    const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(viewerUrl ?? '').origin,
    });
    await page.goto(viewerUrl ?? '');
    await drawn(page, 'Export');
    return { client, page };
  };

  const isFocused = async (locator: Locator): Promise<boolean> =>
    locator.evaluate((element) => element === document.activeElement);

  it(
    'should open the selected part menu from the focused canvas with Shift+F10 and the Menu key, and from the header',
    async () => {
      const { page } = await openKeys();
      const lane = page.getByRole('complementary', { name: 'Workbench' });
      await lane.getByRole('tab', { name: 'Model' }).click();
      const row = lane.getByRole('tabpanel', { name: 'Model' }).getByRole('button', { name: 'Wide', exact: true });
      await row.waitFor({ timeout: 60_000 });
      await row.click();

      /* The header names the selected part; its name opens the part's menu. */
      const trigger = page.getByRole('button', { name: 'Actions for Wide' }).filter({ hasText: 'Wide' });
      await trigger.waitFor();

      /* Shift+F10 on the focused canvas region opens the menu on its first item; ↓ reaches the chat item. */
      const region = page.getByRole('region', { name: 'Model viewer' });
      await region.focus();
      await page.keyboard.press('Shift+F10');
      const menu = page.getByRole('menu');
      await menu.waitFor();
      expect(
        await menu
          .getByRole('menuitem')
          .first()
          .evaluate((item) => item === document.activeElement),
      ).toBe(true);
      const copy = menu.getByRole('menuitem', { name: 'Copy reference' });
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      expect(await isFocused(copy)).toBe(true);
      await capture(page, 'part-menu-keyboard');
      await page.keyboard.press('Enter');
      await page.getByRole('status').filter({ hasText: 'Copied; paste it into your chat' }).waitFor();
      expect(await page.evaluate(async () => navigator.clipboard.readText())).toMatch(
        /^Wide in keys @cad\[keys\.ts#[^\]]+\]$/u,
      );
      expect(await menu.count()).toBe(0);
      await expect.poll(async () => isFocused(region)).toBe(true);

      /* The Menu key opens the same menu; Escape closes it and gives focus back to the canvas region. */
      await page.keyboard.press('ContextMenu');
      await menu.waitFor();
      expect(await menu.getByRole('menuitem', { name: 'Reveal in Explorer' }).count()).toBe(1);
      await page.keyboard.press('Escape');
      await expect.poll(async () => menu.count()).toBe(0);
      await expect.poll(async () => isFocused(region)).toBe(true);

      /* The header's trigger opens the same items, with the arrow keys of a dropdown menu. */
      await trigger.focus();
      await page.keyboard.press('Enter');
      await menu.waitFor();
      for (const name of ['Focus on part', 'Copy reference', 'Reveal in Explorer', 'Hide', 'Isolate']) {
        // oxlint-disable-next-line no-await-in-loop -- one item at a time.
        expect(await menu.getByRole('menuitem', { name, exact: true }).count()).toBe(1);
      }
      await page.keyboard.press('Escape');
      await expect.poll(async () => menu.count()).toBe(0);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );

  /**
   * The centre of the canvas region, where the framed model's wide part sits.
   *
   * @param page - The drawn page.
   * @returns The point in viewport coordinates.
   */
  const regionCentre = async (page: Page): Promise<Readonly<{ x: number; y: number }>> => {
    const box = await page.getByRole('region', { name: 'Model viewer' }).boundingBox();
    if (box === null) {
      throw new Error('The canvas region has no box.');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  /* A right click on a part still opens the menu: "the tab's panels (W10)" checks it in the harness. */
  it(
    'should still pan on a right drag past 4 px, opening no menu',
    async () => {
      const { client, page } = await openKeys();
      const centre = await regionCentre(page);
      /* The camera's target, once the page has reported a view. */
      const targetOf = async (): Promise<string | undefined> => {
        const result = await callTool(client, 'view_state', {});
        const view = (result.structuredContent as { view?: TauViewerViewState } | undefined)?.view;
        return view?.camera === undefined ? undefined : JSON.stringify(view.camera.target);
      };
      await expect.poll(targetOf, { timeout: 30_000 }).toBeDefined();
      const before = await targetOf();
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(centre.x + 40, centre.y + 20, { steps: 8 });
      await page.mouse.up({ button: 'right' });
      expect(await page.getByRole('menu').count()).toBe(0);
      await expect.poll(targetOf, { timeout: 30_000 }).not.toBe(before);
      expect(pageErrors).toEqual([]);
      await page.close();
    },
    kernelCallLimit,
  );
});

describe('the viewer page from a text host', () => {
  it(
    'should open the loopback link in the tab composition',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'main.ts' }));
      expect(viewerUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?model=/u);
      /* A later show does not change what the first link opens. */
      shown(await callTool(client, 'show_model', { targetFile: 'small.glb' }));
      const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
      await page.goto(viewerUrl ?? '');

      await drawn(page, 'Export');
      /* The workbench's file tab names the source the link shows. */
      expect(await page.getByTitle('main.ts', { exact: true }).count()).toBe(1);
      await page.getByRole('group', { name: 'Viewer controls' }).waitFor();
      await capture(page, 'loopback');
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should carry Share, Export and the workbench toggle in the header of a narrow tab, and no host actions in the bar',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'main.ts' }));
      /* Below 720 px the tab opens with the canvas whole; the header is the only way to the panes. */
      const page = await launched().newPage({ viewport: { width: 700, height: 640 } });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');

      await checkTabChrome(page, false);
      const share = page.getByRole('group', { name: 'Workbench actions' }).getByRole('button', { name: 'Share' });
      const shareLabel = share.getByText('Share', { exact: true });
      expect(await shareLabel.isVisible()).toBe(true);
      await capture(page, 'loopback-header');
      /* A narrower tab folds the labels to their icons; the names stay. */
      await page.setViewportSize({ width: 480, height: 640 });
      await expect.poll(async () => shareLabel.isVisible()).toBe(false);
      const folded = await share.boundingBox();
      expect(folded?.width).toBe(28);
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should name the version mismatch when the server has no formats tool',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'small.glb' }));
      const page = await launched().newPage({ viewport: { width: 900, height: 640 } });
      /* A `tau` from before the formats tool answers the loopback call as the server does for any tool it lacks. */
      await page.route('**/api/tools/call', async (route) => {
        const { name } = route.request().postDataJSON() as { name: string };
        await (name === 'app_export_formats'
          ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"errorCode":"UNKNOWN_TOOL"}' })
          : route.continue());
      });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');

      const { version } = packageJson;
      const panel = await openPane(page, 'Export');
      const mismatch = panel.getByRole('alert', { name: 'Export formats could not be loaded' });
      await expect
        .poll(async () => mismatch.textContent())
        .toContain(
          `plugin ${version} needs the same version: npm install -g @taucad/cli@${version}, then restart the Tau server or your agent`,
        );
      expect(await mismatch.getByRole('button').count()).toBe(0);
      await capture(page, 'loopback-older-server');
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    'should fit the opening tabs beside the header buttons and activate each at its centre (VUI-5)',
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'small.glb' }));
      const page = await launched().newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');

      const lane = page.getByRole('complementary', { name: 'Workbench' });
      const tablist = lane.getByRole('tablist', { name: 'Open panes' });
      const tabs = tablist.getByRole('tab');
      expect(await tabs.allTextContents()).toEqual(['Parameters', 'Model', 'Kinematics']);
      expect(await lane.getByRole('button', { name: 'Hide workbench' }).count()).toBe(0);
      expect(await tablist.evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true);
      /* Each tab's centre hits the tab, never a header button drawn over it. */
      const hits = await tabs.evaluateAll((elements) =>
        elements.map((tab) => {
          const box = tab.getBoundingClientRect();
          return tab.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }),
      );
      expect(hits).toEqual([true, true, true]);
      /* A pointer click at the centre, as a browser agent clicks, with nothing scrolling the tab into view first. */
      const kinematics = await tablist.getByRole('tab', { name: 'Kinematics' }).boundingBox();
      if (kinematics === null) {
        throw new Error('The Kinematics tab has no box.');
      }
      await page.mouse.click(kinematics.x + kinematics.width / 2, kinematics.y + kinematics.height / 2);
      await lane.getByRole('tabpanel', { name: 'Kinematics' }).waitFor();
      expect(await tablist.evaluate((list) => list.scrollLeft)).toBe(0);
      await capture(page, 'lane-header');
      await page.close();
    },
    kernelCallLimit,
  );

  it(
    "should name the part under the pointer as the app's viewer does, and drop the name when the pointer leaves",
    async () => {
      const client = await connect('claude-code', claudeCodeCapabilities);
      const { viewerUrl } = shown(await callTool(client, 'show_model', { targetFile: 'small.glb' }));
      const page = await launched().newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(viewerUrl ?? '');
      await drawn(page, 'Export');

      const region = page.getByRole('region', { name: 'Model viewer' });
      const box = await region.boundingBox();
      if (box === null) {
        throw new Error('The canvas region has no box.');
      }
      const badge = page.getByTestId('model-component-name-badge');
      /* The surface fills the middle of the framed view; the label names it as the Model pane's row does. */
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await expect.poll(async () => badge.textContent(), { timeout: 30_000 }).toBe('surface');
      expect(await badge.getAttribute('aria-hidden')).toBe('true');
      await capture(page, 'hover-label');
      /* Off the canvas, into the lane: the label goes. */
      const lane = await page.getByRole('complementary', { name: 'Workbench' }).boundingBox();
      await page.mouse.move((lane?.x ?? 0) + 40, (lane?.y ?? 0) + 200, { steps: 4 });
      await expect.poll(async () => badge.count()).toBe(0);
      await page.close();
    },
    kernelCallLimit,
  );
});
