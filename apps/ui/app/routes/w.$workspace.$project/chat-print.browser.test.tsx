import '#styles/global.css';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  carveraManifest,
  machineEntry,
  machineSnapshot,
  millingComponents,
  routerManifest,
} from '#components/print/testing/machines.fixture.js';
import {
  agentJob,
  createBambuStudio,
  createBridge,
  createFixture,
  desktopHost,
  entry,
  printing,
  projectMock,
  fileManagerMock,
  converterMock,
  parametersMock,
  summarizeGcodeContainerMock,
  desktopBridgeMock,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';

/**
 * Screenshot evidence for the reviewed styling: the Print pane at a workbench
 * width and at 320 px, light and dark: a ready printer with a fresh slice; an
 * agent's job awaiting approval; the same job while a run is in progress, so the
 * start waits with its reason; Bambu Studio's overrides; and the same pane serving
 * a Grbl router and a Carvera with Control open (presence, jog pad, spindle).
 */

vi.doMock('#hooks/use-project.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...projectMock,
}));
vi.doMock('#hooks/use-file-manager.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...fileManagerMock,
}));
vi.doMock('#routes/w.$workspace.$project/chat-converter.js', async (importOriginal) =>
  converterMock(await importOriginal()),
);
vi.doMock('#components/geometry/parameters/parameters.js', async (importOriginal) =>
  parametersMock(await importOriginal()),
);
vi.doMock('#components/printer/printer-preparation.js', () => ({
  printerPreparation: {
    prepare: async ({ signal }: { bytes: Uint8Array<ArrayBuffer>; signal: AbortSignal }) => {
      signal.throwIfAborted();
      return { kind: 'refused', summary: summarizeGcodeContainerMock(), preparationDuration: 0 };
    },
  },
}));
vi.doMock('#filesystem/desktop-bridge.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...desktopBridgeMock,
}));
// The chat stack behind the approval bridge is not under test here; the pane receives a bridge directly.
vi.doMock('#hooks/use-machines-approvals.js', () => ({
  useMachineApprovalBridge: () => ({
    pendingForJob: () => undefined,
    pendingActions: () => [],
    respond: async () => undefined,
  }),
}));
vi.doMock('#machines/await-fresh-render.js', () => ({
  awaitFreshRender: async (actor: { getSnapshot: () => unknown }) => actor.getSnapshot(),
}));

const { PrintPanel } = await import('#routes/w.$workspace.$project/chat-print.js');

const outputDirectory = '../../../../../out/research/machines-contract-v3/ui/browser';
const widths = { desktop: 480, narrow: 320 } as const;
const themes = ['light', 'dark'] as const;

type Scenario = 'prepare' | 'approval' | 'busy' | 'studio' | 'router' | 'carvera';

/** The fixture machine observed just now, so the freshness budgets read as current rather than stale. */
const observedNow = (machine: ReturnType<typeof entry>): ReturnType<typeof entry> => ({
  ...machine,
  snapshot: { ...machine.snapshot, observedAt: new Date().toISOString() },
});

const mount = async (scenario: Scenario, width: number): Promise<HTMLElement> => {
  desktopHost.bambuStudio = scenario === 'studio' ? createBambuStudio() : undefined;
  const milling = scenario === 'router' ? routerManifest : scenario === 'carvera' ? carveraManifest : undefined;
  const fixture =
    milling === undefined
      ? scenario === 'prepare' || scenario === 'studio'
        ? createFixture({ entries: [observedNow(entry(scenario === 'studio' ? { providerId: 'bambu' } : {}))] })
        : createFixture({
            entries: [observedNow(scenario === 'busy' ? printing() : entry())],
            jobs: [agentJob()],
          })
      : createFixture({
          entries: [
            observedNow(
              machineEntry({
                manifest: milling,
                name: scenario === 'router' ? 'Garage LongMill' : 'Carvera',
                providerId: `${scenario}-simulator`,
                snapshot: machineSnapshot(millingComponents(milling)),
              }),
            ),
          ],
        });
  const { bridge } = createBridge();
  const { container } = render(
    <TooltipProvider>
      <div data-testid='frame' style={{ width: `${String(width)}px`, height: '900px' }}>
        <PrintPanel machines={{ available: true, ...fixture.client }} bridge={bridge} />
      </div>
    </TooltipProvider>,
  );
  if (scenario === 'studio') {
    // The real printer with Bambu Studio: presets, then Advanced settings with its overrides and one change.
    await screen.findByRole('group', { name: 'Bambu Studio presets' });
    await page.getByRole('button', { name: /^Advanced settings/u }).click();
    await screen.findByRole('group', { name: 'Bambu Studio overrides' });
    await page.getByRole('button', { name: 'Group: Quality' }).click();
    await page.getByRole('spinbutton', { name: 'Input for Layer Height' }).fill('0.16');
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Input for Layer Height' }));
    await screen.findByRole('button', { name: 'Reset Layer Height' });
    // Headless Chromium draws few frames between actions, so the stages' open animations would still
    // be running when measured; finish them (time-based only: scroll shadows follow the scroller).
    for (const animation of document.getAnimations()) {
      if (animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity) {
        animation.finish();
      }
    }
  } else if (scenario === 'prepare') {
    // The Machine select names the printer and its status; slicing is the pane's action bar.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Machine' })).toHaveTextContent('Workshop X1CReady');
    });
    await page.getByRole('button', { name: 'Slice and preview' }).click();
    await screen.findByRole('group', { name: 'Slice result' });
  } else if (milling === undefined) {
    const name = 'Job awaiting you: pyramid.gcode.3mf';
    const region = await screen.findByRole('region', { name });
    expect(within(region).getByRole('button', { name: 'Preview' })).toBeEnabled();
    await page.getByRole('region', { name }).getByRole('checkbox', { name: 'The build plate is clear' }).click();
    if (scenario === 'busy') {
      expect(
        within(region).getByText('Workshop X1C has a run in progress. Start another once it ends.'),
      ).toBeInTheDocument();
    }
  } else {
    // Control opens on a milling machine: the presence switch, the jog pad and the spindle.
    await screen.findByRole('switch', { name: 'I am at the machine' });
    await page.getByRole('switch', { name: 'I am at the machine' }).click();
    const control = screen.getByRole('button', { name: /^Control/u });
    if (control.getAttribute('aria-expanded') !== 'true') {
      await page.getByRole('button', { name: /^Control/u }).click();
    }
    await screen.findByRole('group', { name: 'Jog X and Y' });
  }
  return container;
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('Print pane screenshots', () => {
  it.each(Object.entries(widths).flatMap(([size, width]) => themes.map((theme) => ({ size, width, theme }))))(
    'should keep the Prepare reset beside its title at $size in $theme',
    async ({ size, width, theme }) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await page.viewport(size === 'desktop' ? 1000 : width, 900);
      await mount('studio', width);
      const prepare = screen.getByRole('region', { name: 'Prepare' });
      const trigger = within(prepare).getByRole('button', { name: /^Prepare/u });
      const title = within(trigger).getByText('Prepare', { exact: true });
      const reset = within(prepare).getByRole('button', { name: 'Reset print settings' });
      const titleBounds = title.getBoundingClientRect();
      const resetBounds = reset.getBoundingClientRect();
      expect(resetBounds.left - titleBounds.right).toBe(8);
      expect(resetBounds.top + resetBounds.height / 2).toBe(titleBounds.top + titleBounds.height / 2);
      expect(trigger).not.toContainElement(reset);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const evidence = '../../../../../out/artifacts/print-reset-placement';
      await page.screenshot({ element: prepare, path: `${evidence}/prepare-${size}-${theme}.png` });
      await page.getByRole('button', { name: 'Reset print settings' }).hover();
      await screen.findByRole('tooltip', { name: 'Reset print settings' });
      await page.screenshot({ element: prepare, path: `${evidence}/prepare-${size}-${theme}-hover.png` });

      await page.getByRole('button', { name: /^Prepare/u }).click();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(reset.getBoundingClientRect().left).toBe(resetBounds.left);
      await page.getByRole('button', { name: 'Reset print settings' }).click();
      await waitFor(() => {
        expect(within(prepare).queryByRole('button', { name: 'Reset print settings' })).not.toBeInTheDocument();
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    },
  );

  it.each(
    ['Machine', 'Plate', 'Material', 'Process', 'Filament A1'].flatMap((label) => [
      { label, width: 720, theme: 'light' },
      { label, width: 480, theme: 'dark' },
    ]),
  )(
    'should overlay the selected $label option at $width in $theme without layout shift',
    async ({ label, width, theme }) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await page.viewport(800, 1200);
      const container = await mount('studio', width);
      // Leave room for grouped options above the trigger, avoiding viewport collision repositioning.
      container.style.paddingTop = '120px';
      const trigger = screen.getByRole('combobox', { name: label });
      trigger.scrollIntoView({ block: 'center' });
      const before = trigger.getBoundingClientRect();
      const radius = getComputedStyle(trigger).borderRadius;
      const swatch = trigger.querySelector('[data-slot="material-swatch"]')?.getBoundingClientRect();
      await page.getByRole('combobox', { name: label }).click();
      const option = screen.getByRole('option', { selected: true });
      const after = option.getBoundingClientRect();
      await page.screenshot({ path: `${outputDirectory}/select-${label.replaceAll(' ', '-')}-${theme}.png` });
      expect({ x: after.x, y: after.y, width: after.width, height: after.height }).toEqual({
        x: before.x,
        y: before.y,
        width: before.width,
        height: before.height,
      });
      expect(getComputedStyle(option).borderRadius).toBe(radius);
      expect(trigger.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
      if (swatch) {
        expect(option.querySelector('[data-slot="material-swatch"]')?.getBoundingClientRect().toJSON()).toEqual(
          swatch.toJSON(),
        );
      }
      await page.getByRole('option', { selected: true }).click();
      expect(screen.getByRole('combobox', { name: label }).getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    },
  );

  it('should scroll the pane to every stage instead of clipping the stages to its height', async () => {
    await mount('router', 720);
    const control = await screen.findByRole('region', { name: 'Control' });
    // A pane shorter than its stages, as a docked pane often is.
    screen.getByTestId('frame').style.height = '400px';
    const stages = control.closest<HTMLElement>('[data-slot="print-stages"]')!;
    const scroller = stages.parentElement!;
    // A stage list that shrinks to the pane hides what is below it and leaves nothing to scroll.
    expect(stages.scrollHeight - stages.clientHeight).toBeLessThanOrEqual(1);
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  });

  it('should space the Prepare setup rows evenly', async () => {
    await page.viewport(800, 1200);
    await mount('studio', 720);
    // The filament presets are overrides under Advanced settings, not Prepare setup rows.
    const rows = ['Profile', 'Plate', 'Material', 'Process'].map((label) =>
      screen
        .getByRole('combobox', { name: label })
        .closest(String.raw`.group\/field`)!
        .getBoundingClientRect(),
    );
    const gaps = rows.slice(1).map((row, index) => row.top - rows[index]!.bottom);
    expect(gaps).toEqual(gaps.map(() => gaps[0]));
  });

  for (const scenario of ['prepare', 'approval', 'busy', 'studio', 'router', 'carvera'] as const) {
    for (const [size, width] of Object.entries(widths)) {
      for (const theme of themes) {
        it(`captures ${scenario} at ${size} in ${theme}`, async () => {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          await page.viewport(Math.max(width, 320), 900);
          const container = await mount(scenario, width);
          const frame = within(container).getByTestId('frame');
          // The pane stacks at 320 px: nothing scrolls sideways.
          expect(frame.scrollWidth).toBeLessThanOrEqual(width);
          const path = await page.screenshot({
            element: frame,
            path: `${outputDirectory}/print-${scenario}-${size}-${theme}.png`,
          });
          expect(path).toContain(`print-${scenario}-${size}-${theme}.png`);
        });
      }
    }
  }
});
