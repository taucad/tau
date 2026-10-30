// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceProjectRoute from '#routes/w.$workspace.$project/route.js';

const pending = vi.hoisted(() => {
  const module = Promise.withResolvers<never>();
  return { ...module, recover: vi.fn(), resolving: false };
});
vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', async () => pending.promise);
vi.mock('#lib/stale-build-recovery.js', () => ({ recoverFromCaughtError: pending.recover }));
vi.mock('#routes/w.$workspace.$project/project-route.js', () => ({
  ProjectRouteProviders: ({ children }: { readonly children: React.JSX.Element }) => children,
  projectRouteHandle: {},
}));
vi.mock('#routes/w.$workspace.$project/project-route-state.js', () => ({
  useProjectRouteState: () => (pending.resolving ? { kind: 'resolving' } : undefined),
}));
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', () => ({
  ProjectRouteNotice: () => <p>Resolving the requested project</p>,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({
  WorkspaceSkeleton: () => <p role='status'>Loading workspace</p>,
}));

describe('project entry module failure', () => {
  it('should keep recovery bounded and return to the current authority notice on navigation', async () => {
    const view = render(<WorkspaceProjectRoute />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspace');
    const error = new TypeError('Failed to fetch dynamically imported module');
    await act(async () => {
      pending.reject(error);
    });
    expect(await screen.findByRole('alert', { name: 'Workspace unavailable' })).toBeInTheDocument();
    // Vitest wraps a rejected module factory and retains the import failure as its cause.
    expect(pending.recover).toHaveBeenCalledWith(expect.objectContaining({ cause: error }));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert', { name: 'Workspace unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    pending.resolving = true;
    view.rerender(<WorkspaceProjectRoute />);
    expect(screen.getByText('Resolving the requested project')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
