import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import { placeChatOnNewBranch } from '#support/chat-branch.js';
import { readProjectCheckoutTree, readProjectStorageState } from '#support/project-storage-state.js';
import { readWorkbenchModifiedAt, readWorkbenchTree, writeWorkbenchFile } from '#support/workbench-files.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const usage = { inputTokens: 12, outputTokens: 6 };
const model = 'public/models/honeycomb.js';
const layoutPath = '/.tau/workbench/layout.json';
const tab = (name: string) => selectors.getByCss(`.dv-tab[aria-label="${name}"]`);
const viewTab = (title: string) => selectors.getByCss('.dv-tab').filter({ hasText: title });
const readFile = async (path: string): Promise<string | undefined> => {
  const files = await readWorkbenchTree();
  return files[path];
};
const workbenchBytes = async (): Promise<Readonly<Record<string, string>>> =>
  Object.fromEntries(Object.entries(await readWorkbenchTree()).filter(([path]) => path.startsWith('/.tau/workbench/')));

const toolResult = (requests: readonly unknown[]): { isError: boolean; text: string } => {
  const blocks = requests.flatMap((request) =>
    ((request as { messages?: ReadonlyArray<{ content?: unknown }> }).messages ?? []).flatMap((message) =>
      Array.isArray(message.content) ? (message.content as ReadonlyArray<Record<string, unknown>>) : [],
    ),
  );
  const block = blocks.findLast((part) => part['type'] === 'tool_result');
  const content = block?.['content'];
  return {
    isError: block?.['is_error'] === true,
    text: Array.isArray(content)
      ? content.map((part) => (part as { text?: string }).text ?? '').join('')
      : typeof content === 'string'
        ? content
        : '',
  };
};

const call = async (
  args: Record<string, unknown>,
  message: string,
  options: { focusDuring?: boolean; surface?: 'primary' | 'secondary' } = {},
): Promise<{ isError: boolean; text: string }> => {
  const { focusDuring = false, surface = 'primary' } = options;
  const script: readonly GatewayScriptTurn[] = [
    { toolCalls: [{ name: 'arrange_workbench', args }], usage, gated: focusDuring },
    { text: `Done: ${message}`, usage },
  ];
  await target.installAgentHostGatewayFixture(script);
  await target.type(composer, message, surface);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last(), undefined, surface);
  if (focusDuring) {
    await target.waitForAgentHostGatewayGate({ kind: 'stream' }, 120_000);
    await target.focus(composer, surface);
    await target.releaseAgentHostGatewayFixture();
  }
  await target.expectVisible(selectors.getByText(`Done: ${message}`, { exact: true }), 120_000, surface);
  return toolResult(await target.readAgentHostGatewayRequests());
};

const openProject = async (): Promise<void> => {
  await target.installAgentHostGatewayFixture([{ text: 'Ready.', usage }]);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-file-tree?chat=1');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectVisible(selectors.getByCss(composer), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

test('arranges review views and a report from the live root, then restores', async () => {
  await openProject();
  const views = [
    { id: 'front', name: 'Front', entryPath: model, camera: { kind: 'preset', preset: 'front' } },
    { id: 'left', name: 'Left', entryPath: model, camera: { kind: 'preset', preset: 'left' } },
    {
      id: 'joint',
      name: 'Joint',
      entryPath: model,
      camera: { kind: 'look', direction: [0, -1, 0] },
      grid: { unit: 'cm' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
    },
  ];
  const viewer = {
    kind: 'split',
    direction: 'row',
    children: [
      {
        kind: 'group',
        tabs: [
          { kind: 'view', view: 'front' },
          { kind: 'view', view: 'left' },
        ],
        active: 0,
      },
      { kind: 'group', tabs: [{ kind: 'view', view: 'joint' }], active: 0 },
    ],
  };
  const result = await call({ views, viewer, lanes: { workbench: false } }, 'Arrange review views.');
  expect(result.isError, result.text).toBe(false);
  expect(JSON.parse(result.text)).toMatchObject({
    status: 'written',
    visible: [
      { kind: 'view', view: 'front' },
      { kind: 'view', view: 'joint' },
    ],
  });
  await target.expectVisible(viewTab('Front · honeycomb.js'), 60_000);
  await target.expectVisible(viewTab('Left · honeycomb.js'), 60_000);
  await target.expectVisible(viewTab('Joint · honeycomb.js'), 60_000);
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridges =
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                  getSectionState(): { isActive: boolean; cuts: Array<{ kind: string; offset?: number }> };
                  getCamera(): {
                    position: readonly [number, number, number];
                    target: readonly [number, number, number];
                  };
                }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.some((bridge) => {
            const section = bridge.getSectionState();
            const camera = bridge.getCamera();
            const fromModel = camera.position.map((value, index) => value - camera.target[index]!);
            const length = Math.hypot(...fromModel);
            return (
              section.isActive &&
              section.cuts.some((cut) => cut.kind === 'plane' && cut.offset === 0.012) &&
              Math.abs(fromModel[0]! / length) < 0.05 &&
              fromModel[1]! / length < -0.95 &&
              Math.abs(fromModel[2]! / length) < 0.05
            );
          });
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await target.expectVisible(selectors.getByRole('button', { name: /Grid .* cm, units and grid/iu }), 60_000);
  let files = await readWorkbenchTree();
  expect(JSON.parse(files[layoutPath]!)).toMatchObject({
    viewer: { kind: 'split', direction: 'row' },
    lanes: { workbench: false },
  });
  expect(JSON.parse(files['/.tau/workbench/views/joint.json']!)).toMatchObject({
    camera: { kind: 'look', direction: [0, -1, 0] },
    grid: { unit: 'cm' },
    section: { cuts: [{ offset: 0.012 }] },
  });

  const report = await call(
    { open: [{ kind: 'file', path: 'src/readme.md', presentation: 'preview' }] },
    'Open the report.',
    { focusDuring: true },
  );
  expect(report.isError, report.text).toBe(false);
  await target.expectVisible(tab('src/readme.md'), 60_000);
  expect(JSON.parse((await readFile(layoutPath))!)).toMatchObject({ lanes: { workbench: true } });
  expect(await target.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Ask Tau to build anything...',
  );
  const card = selectors.getByText(/Arranged:/u).last();
  await target.expectVisible(card, 60_000);
  await target.expectVisible(selectors.getByRole('button', { name: 'Restore' }).last(), 60_000);

  const beforeClose = await readWorkbenchTree();
  const close = await call({ close: [{ kind: 'view', view: 'left' }] }, 'Close the left view.');
  expect(close.isError, close.text).toBe(false);
  files = await readWorkbenchTree();
  expect(beforeClose['/.tau/workbench/views/left.json']).toBeDefined();
  expect(files['/.tau/workbench/views/left.json']).toBeUndefined();
  await target.expectCount(viewTab('Left · honeycomb.js'), 0, 60_000);
  await target.click(selectors.getByRole('button', { name: 'Restore' }).last());
  await target.expectVisible(viewTab('Left · honeycomb.js'), 60_000);
  expect(await readFile('/.tau/workbench/views/left.json')).toBeDefined();
});

test('writes entry settings, shows a new view without open, and refuses a stale basedOn without changing bytes', async () => {
  await openProject();
  await writeWorkbenchFile(
    model,
    `import { makeBaseBox } from 'replicad';
export default function main() {
  return [
    { name: 'Base', shape: makeBaseBox(20, 14, 4) },
    { name: 'Cap', shape: makeBaseBox(10, 10, 5).translate([30, 0, 0]) },
  ];
}
`,
  );
  await target.reload();
  await target.expectVisible(selectors.getByCss(composer), 60_000);
  const componentIds = async (): Promise<string[]> =>
    target.evaluate(() => {
      const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): Array<{ id: string }> } })
        .__TAU_SECTION_VIEW_TEST__;
      return bridge?.getModelComponents().map(({ id }) => id) ?? [];
    });
  await expect
    .poll(
      async () => {
        const ids = await componentIds();
        return ids.length;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(2);
  const ids = await componentIds();
  const hidden = ids.slice(0, 2);
  expect(new Set(hidden).size).toBe(2);
  const result = await call(
    {
      views: [{ id: 'inspect', name: 'Inspect', entryPath: model, camera: { kind: 'look', direction: [0, -1, 0] } }],
      entries: [{ path: model, renderTimeout: 0, components: { hidden } }],
    },
    'Inspect the joint.',
  );
  expect(result.isError, result.text).toBe(false);
  await target.expectVisible(viewTab('Inspect · honeycomb.js'), 60_000);
  await target.click(viewTab('Inspect · honeycomb.js'));
  const before = await readWorkbenchTree();
  expect(JSON.parse(before['/.tau/workbench/entries.json']!)).toMatchObject({
    entries: { [model]: { renderTimeout: 0, components: { hidden } } },
  });
  await expect
    .poll(
      async () =>
        target.evaluate((requestedIds) => {
          const bridges =
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{ getModelVisibility(): { hiddenComponentIds: string[] } }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.some((bridge) =>
            requestedIds.every((id) => bridge.getModelVisibility().hiddenComponentIds.includes(id)),
          );
        }, hidden),
      { timeout: 60_000 },
    )
    .toBe(true);
  await target.click(selectors.getByRole('button', { name: 'Viewer settings' }).last());
  await target.expectVisible(
    selectors.getByCss('[data-slot="dropdown-menu-select-item"] [role="combobox"]').filter({ hasText: 'Disabled' }),
    60_000,
  );
  await target.keyboardPress('Escape');
  const beforeWorkbench = await workbenchBytes();
  const conflict = await call(
    { basedOn: 'missing', open: [{ kind: 'pane', pane: 'model' }] },
    'Use an old arrangement digest.',
  );
  expect(conflict.isError).toBe(true);
  expect(conflict.text).toContain('RECORD_CONFLICT');
  expect(await workbenchBytes()).toEqual(beforeWorkbench);
});

test('accepts a current basedOn digest and exposes refused debug intent to the next turn', async () => {
  await openProject();
  await target.evaluate(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ tauDebug: false }));
  });
  await target.reload();
  await target.expectVisible(selectors.getByCss(composer), 60_000);
  const first = await call(
    {
      views: [
        { id: 'digest-source', name: 'Digest source', entryPath: model, camera: { kind: 'preset', preset: 'front' } },
      ],
    },
    'Establish an arrangement digest.',
  );
  expect(first.isError, first.text).toBe(false);
  await target.expectVisible(viewTab('Digest source · honeycomb.js'), 60_000);
  const written = JSON.parse(first.text) as { revisions: Array<{ path: string; digest: string }> };
  const digest = written.revisions.find(({ path }) => path.endsWith('/layout.json'))?.digest;
  expect(digest).toMatch(/^sha256:/u);
  const next = await call({ basedOn: digest, open: [{ kind: 'pane', pane: 'kernel' }] }, 'Show kernel diagnostics.');
  expect(next.isError, next.text).toBe(false);
  await target.expectVisible(selectors.getByText('Shown partly', { exact: true }), 60_000);
  await target.expectVisible(tab('kernel'), 60_000);
  await target.expectVisible(selectors.getByText('Kernel diagnostics require debug mode.'), 60_000);
  const subsequent = await call({ open: [{ kind: 'pane', pane: 'details' }] }, 'Inspect adopted state.');
  expect(subsequent.isError, subsequent.text).toBe(false);
  const requests = await target.readAgentHostGatewayRequests();
  const contextBlocks = requests.flatMap((request) =>
    ((request as { messages?: ReadonlyArray<{ content?: unknown }> }).messages ?? []).flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as ReadonlyArray<{ type?: string; text?: string }>)
            .filter(({ type }) => type === 'text')
            .map(({ text }) => text ?? '')
        : typeof message.content === 'string'
          ? [message.content]
          : [],
    ),
  );
  const context = contextBlocks.findLast((text) => text.includes('<workbench_snapshot>'));
  const snapshotJson = context?.match(/<workbench_snapshot>\s*([\s\S]*?)\s*<\/workbench_snapshot>/u)?.[1];
  expect(snapshotJson).toBeDefined();
  const snapshot = JSON.parse(snapshotJson!) as {
    unavailable: string[];
    refused: Array<{ tab: { kind: string; pane: string }; reason: string }>;
  };
  expect(snapshot.unavailable).toEqual(expect.arrayContaining(['kernel', 'console']));
  expect(snapshot.refused).toContainEqual({ tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' });
});

test('adopts another window’s arrangement at a different width without rewriting its bytes', async () => {
  await openProject();
  const projectUrl = await target.currentUrl();
  await target.openSecondary(projectUrl);
  try {
    await target.setViewport({ width: 960, height: 800 }, 'secondary');
    await target.expectVisible(selectors.getByCss('[data-testid="cad-viewer-canvas-region"]'), 60_000, 'secondary');
    const arranged = await call(
      {
        views: [
          { id: 'cross-front', name: 'Cross front', entryPath: model, camera: { kind: 'preset', preset: 'front' } },
          { id: 'cross-left', name: 'Cross left', entryPath: model, camera: { kind: 'preset', preset: 'left' } },
        ],
        viewer: {
          kind: 'split',
          direction: 'row',
          children: [
            { kind: 'group', tabs: [{ kind: 'view', view: 'cross-front' }], size: 0.4 },
            { kind: 'group', tabs: [{ kind: 'view', view: 'cross-left' }], size: 0.6 },
          ],
        },
        lanes: { workbench: false },
      },
      'Arrange both windows.',
    );
    expect(arranged.isError, arranged.text).toBe(false);
    await target.expectVisible(viewTab('Cross front · honeycomb.js'), 60_000);
    await target.expectVisible(viewTab('Cross left · honeycomb.js'), 60_000);
    await target.expectVisible(viewTab('Cross front · honeycomb.js'), 60_000, 'secondary');
    await target.expectVisible(viewTab('Cross left · honeycomb.js'), 60_000, 'secondary');
    const ratioIn = async (surface: 'primary' | 'secondary'): Promise<number> =>
      target.evaluate(
        () => {
          const widthFor = (title: string): number => {
            const group = [...document.querySelectorAll<HTMLElement>('.dv-groupview')].find((candidate) =>
              [...candidate.querySelectorAll('.dv-tab')].some((tab) => tab.textContent.includes(title)),
            );
            return group?.getBoundingClientRect().width ?? 0;
          };
          const front = widthFor('Cross front · honeycomb.js');
          const left = widthFor('Cross left · honeycomb.js');
          return front > 0 && left > 0 ? front / (front + left) : Number.NaN;
        },
        undefined,
        surface,
      );
    await expect.poll(async () => ratioIn('primary'), { timeout: 60_000 }).toBeGreaterThan(0.37);
    expect(await ratioIn('primary')).toBeLessThan(0.43);
    await expect.poll(async () => ratioIn('secondary'), { timeout: 60_000 }).toBeGreaterThan(0.37);
    expect(await ratioIn('secondary')).toBeLessThan(0.43);
    const bytes = await readFile(layoutPath);
    const modifiedAt = await readWorkbenchModifiedAt(layoutPath);
    expect(bytes).toBeDefined();
    expect(JSON.parse(bytes!) as { viewer: { kind: string; children: Array<{ size: number }> } }).toMatchObject({
      viewer: { kind: 'split', children: [{ size: 0.4 }, { size: 0.6 }] },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5500);
    });
    expect(await readFile(layoutPath)).toBe(bytes);
    expect(await readWorkbenchModifiedAt(layoutPath)).toBe(modifiedAt);
    expect(await target.evaluate(() => window.innerWidth)).toBe(1440);
    expect(await target.evaluate(() => window.innerWidth, undefined, 'secondary')).toBe(960);
  } finally {
    await target.closeSecondary();
  }
});

test('writes an arrangement to the live project root from a candidate chat', async () => {
  await openProject();
  await placeChatOnNewBranch('candidate-arrangement');
  const state = await readProjectStorageState();
  const projectUrl = new URL(await target.currentUrl());
  const project = state.configs.find(
    ({ providerBasePath }) => providerBasePath === projectUrl.pathname.split('/').at(-1),
  );
  expect(project).toBeDefined();
  const result = await call(
    {
      views: [
        {
          id: 'candidate-front',
          name: 'Candidate front',
          entryPath: model,
          camera: { kind: 'preset', preset: 'front' },
        },
      ],
    },
    'Arrange from my branch.',
  );
  expect(result.isError, result.text).toBe(false);
  await target.expectVisible(viewTab('Candidate front · honeycomb.js'), 60_000);
  expect(await readFile('/.tau/workbench/views/candidate-front.json')).toBeDefined();
  const live = JSON.parse((await readFile(layoutPath))!) as { viewer: { tabs: Array<{ view: string }> } };
  expect(live.viewer.tabs.some(({ view }) => view === 'candidate-front')).toBe(true);
  const checkout = await readProjectCheckoutTree(project!);
  expect(Object.keys(checkout).some((path) => path.endsWith('/.tau/workbench/views/candidate-front.json'))).toBe(false);
});

test('adopts a workbench edit when an inactive project page is reopened', async () => {
  await openProject();
  const projectUrl = await target.currentUrl();
  await target.openSecondary(projectUrl);
  try {
    await target.expectVisible(selectors.getByRole('button', { name: 'Toggle Chat lane' }), 60_000, 'secondary');
    if (!(await target.isVisible(selectors.getByCss(composer), 'secondary'))) {
      await target.click(selectors.getByRole('button', { name: 'Toggle Chat lane' }), undefined, 'secondary');
    }
    await target.expectVisible(selectors.getByCss(composer), 60_000, 'secondary');
    await target.navigate('/projects');
    const result = await call(
      {
        views: [
          {
            id: 'returned-front',
            name: 'Returned front',
            entryPath: model,
            camera: { kind: 'preset', preset: 'front' },
          },
        ],
      },
      'Arrange while the other page is away.',
      { surface: 'secondary' },
    );
    expect(result.isError, result.text).toBe(false);
    await target.expectVisible(viewTab('Returned front · honeycomb.js'), 60_000, 'secondary');
    await target.navigate(projectUrl);
    await target.expectVisible(viewTab('Returned front · honeycomb.js'), 60_000);
    expect(await readFile('/.tau/workbench/views/returned-front.json')).toBeDefined();
  } finally {
    await target.closeSecondary();
  }
});
