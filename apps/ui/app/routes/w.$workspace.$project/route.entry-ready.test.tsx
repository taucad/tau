// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceProjectRoute from '#routes/w.$workspace.$project/route.js';

const pending = vi.hoisted(() => {
  const module = Promise.withResolvers<{ ProjectChatRoute: () => React.JSX.Element }>();
  return { ...module, rendered: vi.fn(), resolving: false };
});
vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', async () => pending.promise);
vi.mock('#lib/stale-build-recovery.js', () => ({ recoverFromCaughtError: vi.fn() }));
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

describe('project entry module readiness', () => {
  it('should discard completion for a departed editor and render the module when the current route admits it', async () => {
    const view = render(<WorkspaceProjectRoute />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspace');
    pending.resolving = true;
    view.rerender(<WorkspaceProjectRoute />);
    await act(async () => {
      pending.resolve({
        ProjectChatRoute: () => {
          pending.rendered();
          return <input aria-label='Project editor' defaultValue='Existing draft' />;
        },
      });
    });
    expect(screen.getByText('Resolving the requested project')).toBeInTheDocument();
    expect(pending.rendered).not.toHaveBeenCalled();
    pending.resolving = false;
    view.rerender(<WorkspaceProjectRoute />);
    expect(await screen.findByRole('textbox', { name: 'Project editor' })).toHaveValue('Existing draft');
    expect(pending.rendered).toHaveBeenCalledOnce();
  });
});
