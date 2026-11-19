/**
 * T-G1 on a pinned `cloud` build with stalled entitlements (adaptive app deployment mode charter C1, I15): the app's
 * share panel over the real `cloud` plan facade. While the entitlements request hangs the plan reads `checking`, then
 * `unavailable` at the ask deadline; the person's choice is sent either way and the API decides. A plan refusal
 * offers Publish as public. Unit tests run under the `cloud` ceiling, so `#cloud/commercial-features.js` is the
 * pinned facade here.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import type { PublishDraft, RevisionStatusProjection } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { entitlementDeadlines } from '#cloud/commercial-features.cloud.js';
import { askDeadlineMilliseconds } from '#lib/ask-deadline.js';
import { ProjectSharePanel } from '#components/publish/project-share-panel.js';

const idlePublish: Record<string, unknown> = {
  phase: 'idle',
  tags: [],
  publicationId: undefined,
  shareUrl: undefined,
  error: undefined,
};
const harness = vi.hoisted(() => ({
  publish: undefined as Record<string, unknown> | undefined,
  confirmPublish: vi.fn<(draft: PublishDraft) => void>(),
  openSettings: vi.fn(),
}));

/* The entitlements request never answers: the plan stays unresolved. */
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => ({ ...entitlementsFromTier('free'), isResolved: false, isError: false }),
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({ apiBaseUrl: 'https://api.test', environment: 'staging', userId: 'u1' }),
}));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: harness.openSettings }) }));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [undefined, vi.fn()] }));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionStatus: (): Partial<RevisionStatusProjection> => ({
    projectId: 'p',
    headRevisionId: 'rev_1',
    line: { kind: 'branch', name: 'main' },
    publish: (harness.publish ?? idlePublish) as RevisionStatusProjection['publish'],
  }),
  useRevisionCommands: () => ({
    publishProject: vi.fn(),
    confirmPublish: harness.confirmPublish,
    resetPublish: vi.fn(),
  }),
  useRevisionClient: () => undefined,
}));
// eslint-disable-next-line @typescript-eslint/naming-convention -- the module's own export and variable names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const element = (): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <TooltipProvider>
        <ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />
      </TooltipProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  entitlementDeadlines.cancel();
  harness.publish = idlePublish;
  harness.confirmPublish.mockClear();
  harness.openSettings.mockClear();
  globalThis.fetch = vi.fn(async () =>
    Response.json({ project: { id: 'proj_ui', name: null, description: null }, share: null }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectSharePanel on a pinned cloud build with stalled entitlements (T-G1)', () => {
  it('sends a private choice past the deadline, then offers Publish as public on the plan refusal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const view = render(element());

    const privateOption = await screen.findByRole('radio', { name: /only people you invite/i });
    expect(privateOption).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(askDeadlineMilliseconds);
    });
    /* Past the deadline the plan reads unavailable: the choice is still the person's, and nothing is locked. */
    expect(screen.getByRole('radio', { name: /only people you invite/i })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: /only people you invite/i }));
    await user.click(screen.getByRole('button', { name: /publish and copy link/i }));
    expect(harness.confirmPublish).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'private' }));
    expect(harness.openSettings).not.toHaveBeenCalled();

    harness.publish = { ...idlePublish, phase: 'error', error: 'Private links need the Pro plan.' };
    view.rerender(element());
    await user.click(await screen.findByRole('button', { name: 'Publish as public' }));
    expect(harness.confirmPublish).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'public' }));
    expect(harness.openSettings).not.toHaveBeenCalled();
  });
});
