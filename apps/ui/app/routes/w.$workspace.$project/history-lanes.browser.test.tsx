/**
 * History's lanes in a real browser (History D2): the canvas scenarios at a
 * 336 px and a 236 px pane, light and dark, and the bend rule measured on the
 * SVG the list draws.
 *
 * For every bend: it starts at its dot's centre, both ends are vertical, no rail
 * on the lane it arrives at overlaps it and none stops short of it, and its
 * middle is never flatter than 62° from vertical. A project with one branch,
 * and a second branch with no fork in view, draw no graph at all.
 */
import '#styles/global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { RevisionsPanelBody } from '#routes/w.$workspace.$project/chat-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { lanesScenarios, oneBranchRows } from '#routes/w.$workspace.$project/history-lanes.test-harness.js';
import type { LanesScenario } from '#routes/w.$workspace.$project/history-lanes.test-harness.js';

/* eslint-disable @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.hoisted(() => {
  globalThis.window.ENV = {
    ...globalThis.window.ENV,
    TAU_API_URL: 'https://api.test',
    TAU_GIT_REMOTE_ALLOW_PRIVATE: false,
  };
});
/* eslint-enable @typescript-eslint/naming-convention -- back to the workspace rule for the rest of the file. */
vi.mock('#cloud/commercial-features.js', async () => {
  const cloud = await import('#cloud/commercial-features.cloud.js');
  return { CommercialUpgradeLabel: cloud.CommercialUpgradeLabel, useCommercialFeatures: () => ({}) };
});
const projectSnapshot = { context: { project: { syncChats: true, name: 'Sensor enclosure' } } };
const editorSnapshot = { context: { focusedChatId: undefined } };
const projectRef = { getSnapshot: () => projectSnapshot, subscribe: () => ({ unsubscribe: () => undefined }) };
const editorRef = { getSnapshot: () => editorSnapshot, subscribe: () => ({ unsubscribe: () => undefined }) };
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', projectRef, editorRef }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: () => undefined }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ updateProject: () => undefined }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ observedChatIdsOf: () => [], subscribeMembership: () => () => undefined }),
}));
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats: [] }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats: [], isLoading: false, error: undefined }),
}));
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTauCloudEligibility: () => ({ auth: 'authed', isResolved: true, canSyncFiles: true }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({ placeChat: async () => undefined }),
}));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({
  useTurnOutcomes: () => [],
  clearTurnOutcome: () => undefined,
}));

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

const settle = async (ms = 300): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const branchStatus = (name: string, head: string) =>
  ({ name, head, checkoutId: `checkout-${name}`, checkoutRoot: `/checkouts/${name}`, leaseChatIds: [] }) as const;

/** Script the client with one scenario and render the pane at `width`. */
const renderPane = async (scenario: LanesScenario | undefined, width: number): Promise<void> => {
  revisionStatusHarness.reset();
  if (scenario === undefined) {
    revisionStatusHarness.rows = oneBranchRows;
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: oneBranchRows[0]!.revisionId,
      branches: [branchStatus('main', oneBranchRows[0]!.revisionId)],
    };
  } else {
    revisionStatusHarness.rows = scenario.rows;
    revisionStatusHarness.graph = scenario.graph;
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: scenario.current },
      headRevisionId: scenario.head,
      branches: scenario.graph.branches.map((branch) => branchStatus(branch.name, branch.head)),
    };
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter>
          <div
            data-testid='frame'
            style={{ width, height: 760 }}
            className='flex flex-col overflow-hidden rounded-lg border bg-sidebar text-foreground'
          >
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <RevisionsPanelBody />
            </div>
          </div>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('list', { name: 'History entries' });
  await settle();
  if (scenario?.isAll === true) {
    await page.getByRole('radio', { name: 'All branches' }).click();
    await settle();
  }
};

type Point = Readonly<{ x: number; y: number }>;
type Bend = Readonly<{ start: Point; c1: Point; c2: Point; end: Point; branch: string }>;
type Rail = Readonly<{ x: number; y1: number; y2: number }>;

const numbers = (element: Element, ...names: readonly string[]): number[] =>
  names.map((name) => Number(element.getAttribute(name)));

/** The SVG's bends, rails and marker centres, read back from the DOM. */
const drawn = (): Readonly<{ bends: Bend[]; rails: Rail[]; markers: Point[] }> => {
  const svg = document.querySelector('[data-slot="history-graph"]');
  expect(svg).not.toBeNull();
  const bends = [...svg!.querySelectorAll('[data-graph="bend"]')].map((path): Bend => {
    const values = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
    expect(values).toHaveLength(8);
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = values as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      start: { x: x0, y: y0 },
      c1: { x: c1x, y: c1y },
      c2: { x: c2x, y: c2y },
      end: { x: x1, y: y1 },
      branch: '',
    };
  });
  const rails = [...svg!.querySelectorAll('[data-graph="rail"]')].map((line): Rail => {
    const [x, y1, y2] = numbers(line, 'x1', 'y1', 'y2') as [number, number, number];
    return { x, y1: Math.min(y1, y2), y2: Math.max(y1, y2) };
  });
  const markers = [...svg!.querySelectorAll('[data-graph="marker"]')].map((marker): Point => {
    if (marker.tagName === 'circle') {
      const [x, y] = numbers(marker, 'cx', 'cy') as [number, number];
      return { x, y };
    }
    /* The conflict diamond: `M x y-7 l7 7 …`, centred 7 below its first point. */
    const [x, top] = (marker.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/gu)!.map(Number) as [number, number];
    return { x, y: top + 7 };
  });
  return { bends, rails, markers };
};

const isAt = (left: Point, right: Point): boolean =>
  Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01;

/** The bend rule (I10), for every bend drawn. */
const expectBendRule = (scenario: LanesScenario): void => {
  const { bends, rails, markers } = drawn();
  expect(bends.length, `${scenario.id}: a bend joins every lane past the first`).toBeGreaterThanOrEqual(
    scenario.lanes - 1,
  );
  for (const bend of bends) {
    const label = `${scenario.id} bend ${JSON.stringify(bend)}`;
    // It starts at its dot's centre.
    expect(
      markers.some((marker) => isAt(marker, bend.start)),
      `${label} starts at a marker`,
    ).toBe(true);
    // Both ends are vertical: each control point sits straight above or below its end.
    expect(bend.c1.x, label).toBe(bend.start.x);
    expect(bend.c2.x, label).toBe(bend.end.x);
    expect(bend.c1.y, label).not.toBe(bend.start.y);
    expect(bend.c2.y, label).not.toBe(bend.end.y);
    // On the lane it arrives at, no rail overlaps it, and one meets it exactly or it ends on a marker.
    const [top, bottom] = [Math.min(bend.start.y, bend.end.y), Math.max(bend.start.y, bend.end.y)];
    const arriving = rails.filter((rail) => Math.abs(rail.x - bend.end.x) < 0.01);
    for (const rail of arriving) {
      expect(
        rail.y2 <= top + 0.01 || rail.y1 >= bottom - 0.01,
        `${label} is overlapped by ${JSON.stringify(rail)}`,
      ).toBe(true);
    }
    const isMet =
      arriving.some((rail) => Math.abs(rail.y1 - bend.end.y) < 0.01 || Math.abs(rail.y2 - bend.end.y) < 0.01) ||
      markers.some((marker) => isAt(marker, bend.end));
    expect(isMet, `${label} has a rail or marker where it arrives`).toBe(true);
    // Its middle is never flatter than 62° from vertical: the tangent at t = ½ is (1.5 dx, 0.75 dy).
    const angle =
      (Math.atan2(1.5 * Math.abs(bend.end.x - bend.start.x), 0.75 * Math.abs(bend.end.y - bend.start.y)) * 180) /
      Math.PI;
    expect(angle, `${label} middle slope`).toBeLessThanOrEqual(62);
  }
};

describe('History lanes', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [336, 236] as const) {
      describe(`${theme}, ${String(width)} px`, () => {
        it('should render a one-branch project with no graph, no filter and the one-lane gutter', async () => {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          await renderPane(undefined, width);

          expect(document.querySelector('[data-slot="history-graph"]')).toBeNull();
          expect(document.querySelector('[data-row="chip"]')).toBeNull();
          expect(screen.queryByRole('radio', { name: 'This branch' })).toBeNull();
          const frame = document.querySelector<HTMLElement>('[data-slot="history-graph-frame"]');
          expect(frame?.style.getPropertyValue('--timeline-gutter')).toBe('');
          /* C3's own marker: the Current ring in the row's 1rem gutter. */
          expect(screen.getAllByLabelText('Current', { selector: 'span' })).toHaveLength(1);
        });

        for (const scenario of lanesScenarios) {
          it(`should draw ${scenario.id} with ${String(scenario.lanes)} lane(s) by the bend rule`, async () => {
            document.documentElement.classList.toggle('dark', theme === 'dark');
            await renderPane(scenario, width);

            expect(screen.getByRole('radio', { name: 'This branch' })).toBeVisible();
            if (scenario.lanes === 1) {
              expect(document.querySelector('[data-slot="history-graph"]')).toBeNull();
              expect(document.querySelector('[data-row="chip"]')).toBeNull();
              return;
            }
            const frame = document.querySelector<HTMLElement>('[data-slot="history-graph-frame"]');
            expect(frame?.dataset['lanes']?.split(',')).toHaveLength(scenario.lanes);
            expect(frame?.style.getPropertyValue('--timeline-gutter')).toBe(`${String(16 * scenario.lanes)}px`);
            expectBendRule(scenario);
          });
        }
      });
    }
  }
});
