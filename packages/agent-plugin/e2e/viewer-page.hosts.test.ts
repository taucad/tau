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
import type { Browser, Frame, Page } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TauViewerShowResult, TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import { tauViewerReadLimit } from '@taucad/mcp/viewer-protocol';

import type { HostRecord, TauHost } from '#e2e/basic-host/host.js';

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
/** Uncaught errors in any harness page; each test expects none. */
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

/** The harness host: its display mode, and how it differs from the default (what it declares, the height it allows). */
type HarnessHost = Readonly<{
  displayMode: 'inline' | 'fullscreen';
  hostCapabilities?: Parameters<TauHost['mount']>[0]['hostCapabilities'];
  maxHeight?: number;
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
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.exposeFunction('tauCallTool', async (name: string, args: Record<string, unknown>) =>
    callTool(client, name, args),
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
 * Wait until the page draws a model: the preview is up and Add to chat is live.
 *
 * @param root - The frame or page the viewer is in.
 * @param action - The name of the reference action.
 */
const drawn = async (root: Frame | Page, action: string): Promise<void> => {
  await root.getByRole('img', { name: '3D model preview' }).waitFor({ timeout: 120_000 });
  await root.locator('canvas').waitFor();
  await expect
    .poll(async () => root.getByRole('button', { name: action }).isEnabled(), { timeout: 120_000 })
    .toBe(true);
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

      await drawn(frame, 'Add to chat');
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
      await drawn(viewerFrame(page), 'Add to chat');
      await capture(page, 'step-converted');
      expect(pageErrors).toEqual([]);
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
      await drawn(frame, 'Add to chat');
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
      await drawn(viewerFrame(page), 'Add to chat');
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
      await drawn(frame, 'Add to chat');

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

      await drawn(page, 'Copy prompt');
      /* The workbench's file tab names the source the link shows. */
      expect(await page.getByTitle('main.ts', { exact: true }).count()).toBe(1);
      await page.getByRole('group', { name: 'Viewer controls' }).waitFor();
      await capture(page, 'loopback');
      await page.close();
    },
    kernelCallLimit,
  );
});
