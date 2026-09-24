import '#styles/global.css';
import { cleanup, render, screen, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as PrintSummary from '#routes/w.$workspace.$project/chat-print-summary.js';
import {
  agentRequest,
  createBridge,
  createFixture,
  entry,
  printing,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { PrintPanel } from '#routes/w.$workspace.$project/chat-print.js';

/**
 * Screenshot evidence for the reviewed styling: the Print pane at a workbench
 * width and at 320 px, light and dark, in three states (a ready machine with a
 * fresh slice; a ready machine with an agent's request awaiting approval; the
 * same request while a run is in progress, so the start waits with its reason).
 * PNGs land under `out/research/.../K/` (Lane D's first pass wrote `.../D/`).
 */

vi.mock('#hooks/use-project.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.projectMock;
});
vi.mock('#hooks/use-file-manager.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.fileManagerMock;
});
vi.mock('#hooks/use-revision-status.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.revisionMock;
});
vi.mock('#routes/w.$workspace.$project/chat-converter.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.converterMock;
});
vi.mock('#components/geometry/parameters/parameters.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return { Parameters: fixtures.ParametersFake };
});
vi.mock('#routes/w.$workspace.$project/chat-print-summary.js', async (importOriginal) => {
  const [actual, fixtures] = await Promise.all([
    importOriginal<typeof PrintSummary>(),
    import('#routes/w.$workspace.$project/chat-print.fixture.js'),
  ]);
  return { ...actual, summarizeGcodeContainer: fixtures.summarizeGcodeContainerMock };
});
// The chat stack behind the approval bridge is not under test here; the pane receives a bridge directly.
vi.mock('#hooks/use-machines-approvals.js', () => ({
  usePrintApprovalBridge: () => ({ pendingFor: () => undefined, respond: async () => undefined }),
}));

const outputDirectory = '../../../../../out/research/design-to-print-workbench-blueprint/2026-09-24-implementation/K';
const widths = { desktop: 480, narrow: 320 } as const;
const themes = ['light', 'dark'] as const;

type Scenario = 'prepare' | 'approval' | 'busy';

/** The fixture machine observed just now, so the freshness budgets read as current rather than stale. */
const observedNow = (machine: ReturnType<typeof entry>): ReturnType<typeof entry> => ({
  ...machine,
  snapshot: { ...machine.snapshot, observedAt: new Date().toISOString() },
});

const mount = async (scenario: Scenario, width: number): Promise<HTMLElement> => {
  const fixture =
    scenario === 'prepare'
      ? createFixture({ entries: [observedNow(entry())] })
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
  if (scenario === 'prepare') {
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await page.getByRole('region', { name: 'Prepare' }).getByRole('button', { name: 'Slice and preview' }).click();
    await screen.findByLabelText('Slice result');
  } else {
    const name = 'Print request awaiting you: pyramid.gcode.3mf';
    const region = await screen.findByRole('region', { name });
    expect(within(region).getByRole('button', { name: 'Open printer preview' })).toBeEnabled();
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
  for (const scenario of ['prepare', 'approval', 'busy'] as const) {
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
