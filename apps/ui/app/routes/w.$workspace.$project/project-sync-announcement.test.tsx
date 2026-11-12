/*
 * R7 (Brain research/new-project-viewer-stuck-downloading-blueprint.md, L9): a model surface gated past its bound
 * without progress, and a fill that failed, reach Sentry through the page's own error reporting. Once per wait: a
 * wait is one stretch of the selected checkout's model gate, which every new tree (a new write generation) opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { LargeObjectsFacet, ProjectReadiness } from '@taucad/revisions';
import type { ModelAvailability } from '#hooks/use-project-availability.js';
import { ProjectSyncAnnouncement } from '#routes/w.$workspace.$project/project-sync-placeholder.js';

const mocks = vi.hoisted(() => ({
  model: 'ready' as ModelAvailability,
  facet: undefined as LargeObjectsFacet | undefined,
  status: { projectId: 'project-0', checkoutId: 'checkout-1', readiness: 'filled' as ProjectReadiness },
  report: vi.fn(async (_error: unknown, _details?: unknown) => undefined),
}));

vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/w/x/p', search: '' }), Link: () => null }));
vi.mock('#hooks/use-project-availability.js', () => ({
  useLargeObjects: () => mocks.facet,
  useProjectAvailability: () => 'ready',
  useModelAvailability: () => mocks.model,
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => ({ send: vi.fn() }),
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
  useRevisionStatus: () => ({ ...mocks.status, largeObjects: mocks.facet }),
}));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.report }));

const facet = (changes: Partial<LargeObjectsFacet> = {}): LargeObjectsFacet => ({
  phase: 'fetching',
  paths: ['models/a.step'],
  objects: 1,
  totalObjects: 4,
  bytes: 1024,
  totalBytes: 4096,
  ...changes,
});

/** The reports made so far, as `[error name, tags]`. */
const reports = (): Array<readonly [string, unknown]> =>
  mocks.report.mock.calls.map(([error, details]) => [
    error instanceof Error ? error.name : String(error),
    (details as { tags?: unknown } | undefined)?.tags,
  ]);

const wait = (milliseconds: number): void => {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
};

describe('model wait reporting', () => {
  /* The cap is per project for the page, so each case opens a project of its own. */
  let projects = 0;
  let projectId = 'project-0';
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.report.mockClear();
    mocks.model = 'ready';
    mocks.facet = undefined;
    projects += 1;
    projectId = `project-${String(projects)}`;
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'filled' };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports nothing while the model is ready', () => {
    render(<ProjectSyncAnnouncement />);
    wait(120_000);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('reports a model gate with no download that outlasts its bound, once for the wait', () => {
    mocks.model = 'filesChecking';
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    const view = render(<ProjectSyncAnnouncement />);
    wait(29_999);
    expect(mocks.report).not.toHaveBeenCalled();
    wait(1);
    expect(reports()).toEqual([
      [
        'ModelWaitStalled',
        expect.objectContaining({ 'revisions.fill': 'checking', 'revisions.readiness': 'materialized' }),
      ],
    ]);
    view.rerender(<ProjectSyncAnnouncement />);
    wait(120_000);
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it('reports a download only once it stops making progress', () => {
    mocks.model = 'files';
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    mocks.facet = facet();
    const view = render(<ProjectSyncAnnouncement />);
    for (let step = 2; step <= 6; step += 1) {
      wait(20_000);
      mocks.facet = facet({ objects: step % 4, bytes: 1024 * step });
      view.rerender(<ProjectSyncAnnouncement />);
    }
    expect(mocks.report).not.toHaveBeenCalled();
    wait(30_000);
    expect(reports()).toEqual([['ModelWaitStalled', expect.objectContaining({ 'revisions.fill': 'fetching' })]]);
  });

  it('reports a failed fill once for the wait, and again for the next wait', () => {
    mocks.model = 'filesFailed';
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    mocks.facet = facet({ phase: 'failed', error: 'The remote https://tau.test/v1/git/p.git?x=1 did not answer.' });
    const view = render(<ProjectSyncAnnouncement />);
    expect(reports()).toEqual([['ModelFillFailure', expect.objectContaining({ 'revisions.fill': 'failed' })]]);
    const [, details] = mocks.report.mock.calls[0] ?? [];
    /* A reason is kept for diagnosis, without the address it names. */
    expect(JSON.stringify(details)).toContain('The remote <url> did not answer.');
    expect(JSON.stringify(details)).not.toContain('tau.test');
    /* The fill retries on its own and fails again: the same wait, not another report. */
    mocks.facet = facet({ phase: 'failed', bytes: 2048, error: 'The remote did not answer.' });
    view.rerender(<ProjectSyncAnnouncement />);
    expect(mocks.report).toHaveBeenCalledOnce();
    /* A new tree: the wait ends at filled, and the next one is its own. */
    mocks.model = 'ready';
    mocks.facet = undefined;
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'filled' };
    view.rerender(<ProjectSyncAnnouncement />);
    mocks.model = 'filesFailed';
    mocks.facet = facet({ phase: 'failed', error: 'The remote did not answer.' });
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    view.rerender(<ProjectSyncAnnouncement />);
    expect(reports().map(([name]) => name)).toEqual(['ModelFillFailure', 'ModelFillFailure']);
  });

  it('sends at most three of a kind for a project, however often its watch is made again', () => {
    mocks.model = 'filesChecking';
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    /* Four waits, each on a watch of its own, as a remount of the announcement makes one. */
    for (let remount = 0; remount < 4; remount += 1) {
      const view = render(<ProjectSyncAnnouncement />);
      wait(30_000);
      view.unmount();
    }
    expect(reports().map(([name]) => name)).toEqual(['ModelWaitStalled', 'ModelWaitStalled', 'ModelWaitStalled']);
    /* Another project has its own three. */
    mocks.status = { projectId: `${projectId}-other`, checkoutId: 'checkout-1', readiness: 'materialized' };
    const other = render(<ProjectSyncAnnouncement />);
    wait(30_000);
    other.unmount();
    expect(mocks.report).toHaveBeenCalledTimes(4);
  });

  it('starts a new wait when another checkout is selected', () => {
    mocks.model = 'filesChecking';
    mocks.status = { projectId, checkoutId: 'checkout-1', readiness: 'materialized' };
    const view = render(<ProjectSyncAnnouncement />);
    wait(30_000);
    mocks.status = { projectId, checkoutId: 'checkout-2', readiness: 'materialized' };
    view.rerender(<ProjectSyncAnnouncement />);
    wait(30_000);
    expect(mocks.report).toHaveBeenCalledTimes(2);
  });
});
