import '#styles/global.css';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  agentRequest,
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
 * width and at 320 px, light and dark, in three states (a ready machine with a
 * fresh slice; a ready machine with an agent's request awaiting approval; the
 * same request while a run is in progress, so the start waits with its reason).
 * PNGs land under `out/research/.../K/` (Lane D's first pass wrote `.../D/`).
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
  usePrintApprovalBridge: () => ({ pendingFor: () => undefined, respond: async () => undefined }),
}));
vi.doMock('#machines/await-fresh-render.js', () => ({
  awaitFreshRender: async (actor: { getSnapshot: () => unknown }) => actor.getSnapshot(),
}));

const { PrintPanel } = await import('#routes/w.$workspace.$project/chat-print.js');

const outputDirectory = '../../../../../out/research/print-pane-polish/2026-09-29-implementation/browser';
const widths = { desktop: 480, narrow: 320 } as const;
const themes = ['light', 'dark'] as const;

type Scenario = 'prepare' | 'approval' | 'busy' | 'studio';

/** The fixture machine observed just now, so the freshness budgets read as current rather than stale. */
const observedNow = (machine: ReturnType<typeof entry>): ReturnType<typeof entry> => ({
  ...machine,
  snapshot: { ...machine.snapshot, observedAt: new Date().toISOString() },
});

const mount = async (scenario: Scenario, width: number): Promise<HTMLElement> => {
  desktopHost.bambuStudio = scenario === 'studio' ? createBambuStudio() : undefined;
  const fixture =
    scenario === 'prepare' || scenario === 'studio'
      ? createFixture({ entries: [observedNow(entry(scenario === 'studio' ? { providerId: 'bambu' } : {}))] })
      : createFixture({
          entries: [observedNow(scenario === 'busy' ? printing() : entry())],
          requests: [agentRequest()],
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
    // The real printer with Bambu Studio: presets, then More settings with its overrides and one change.
    await screen.findByRole('group', { name: 'Bambu Studio presets' });
    await page.getByRole('button', { name: 'More settings' }).click();
    await screen.findByRole('group', { name: 'Bambu Studio overrides' });
    await page.getByRole('button', { name: 'Group: Quality' }).click();
    await page.getByRole('spinbutton', { name: 'Input for Layer Height' }).fill('0.16');
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Input for Layer Height' }));
    await screen.findByRole('button', { name: 'Reset Layer Height' });
  } else if (scenario === 'prepare') {
    // The Machine select names the printer and its status; slicing is the pane's action bar.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Machine' })).toHaveTextContent('Workshop X1CReady');
    });
    await page.getByRole('button', { name: 'Slice and preview' }).click();
    await screen.findByRole('group', { name: 'Slice result' });
  } else {
    const name = 'Print request awaiting you: pyramid.gcode.3mf';
    const region = await screen.findByRole('region', { name });
    expect(within(region).getByRole('button', { name: 'Preview' })).toBeEnabled();
    await page.getByRole('region', { name }).getByRole('button', { name: 'Accept' }).click();
    const confirmation = await within(region).findByRole('group', { name: 'Confirm before starting' });
    if (scenario === 'busy') {
      expect(
        within(confirmation).getByText('Workshop X1C has a run in progress. Start another print once it ends.'),
      ).toBeInTheDocument();
    }
  }
  return container;
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('Print pane screenshots', () => {
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

  it('should space the Prepare setup rows evenly', async () => {
    await page.viewport(800, 1200);
    await mount('studio', 720);
    // The filament presets are overrides under More settings, not Prepare setup rows.
    const rows = ['Profile', 'Plate', 'Material', 'Process'].map((label) =>
      screen
        .getByRole('combobox', { name: label })
        .closest(String.raw`.group\/field`)!
        .getBoundingClientRect(),
    );
    const gaps = rows.slice(1).map((row, index) => row.top - rows[index]!.bottom);
    expect(gaps).toEqual(gaps.map(() => gaps[0]));
  });

  for (const scenario of ['prepare', 'approval', 'busy', 'studio'] as const) {
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
