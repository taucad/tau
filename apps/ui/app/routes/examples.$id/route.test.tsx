import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The preview panes drag in the whole CAD stack; the routing decision under
// test is which provider a given id lands in, so only the shell is stubbed.
// `findStaticProject` stays real — it is the branch being exercised.
vi.mock('#routes/w.$workspace.$project_.preview/preview-route.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PreviewSession: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => (
    <div data-testid='preview-session' data-project-id={projectId}>
      {children}
    </div>
  ),
  default: () => <div>preview</div>,
}));
vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({ projects: [], isLoading: false }),
}));
vi.mock('#filesystem/handle-store.js', () => ({ listWorkspaces: async () => [] }));

const examplesRoute = await import('./route.js');

const renderAt = (path: string): void => {
  const Provider = examplesRoute.handle.providers!({} as never);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path='/examples/:id'
            element={
              <Provider>
                <div>example content</div>
              </Provider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('/examples/:id', () => {
  it('mounts the preview session for a community example', async () => {
    renderAt('/examples/jscad_gear');

    expect(await screen.findByTestId('preview-session')).toHaveAttribute('data-project-id', 'jscad_gear');
  });

  // `findStaticProject` is id-based, so a sample whose id happens to look like a
  // `proj_` id still belongs to the examples namespace (blueprint L4).
  it('serves a `proj_`-shaped example id', async () => {
    renderAt('/examples/proj_hollow_box');

    expect(await screen.findByTestId('preview-session')).toHaveAttribute('data-project-id', 'proj_hollow_box');
  });
});
