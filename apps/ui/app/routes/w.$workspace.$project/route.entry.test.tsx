import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#routes/w.$workspace.$project/project-route.js', () => ({
  ProjectRouteProviders: ({ children }: { readonly children: React.JSX.Element }) => children,
  projectRouteHandle: {},
}));
vi.mock('#routes/w.$workspace.$project/project-route-state.js', () => ({
  useProjectRouteState: () => ({ kind: 'resolving' }),
}));
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', () => ({
  ProjectRouteNotice: () => <p>Resolving the requested project</p>,
}));
vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', () => {
  throw new Error('Resolving a route must not import the complete project editor');
});

describe('project route entry', () => {
  it('should show the authoritative route notice without loading the editor', async () => {
    const { default: WorkspaceProjectRoute } = await import('#routes/w.$workspace.$project/route.js');
    expect(renderToString(<WorkspaceProjectRoute />)).toContain('Resolving the requested project');
  });
});
