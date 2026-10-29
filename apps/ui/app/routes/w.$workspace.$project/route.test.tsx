import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIMatch } from 'react-router';

const providerInputs = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('#routes/w.$workspace.$project/project-route.js', () => ({
  ProjectRouteProviders: ({ children, ...input }: React.PropsWithChildren<Record<string, unknown>>) => {
    providerInputs.push(input);
    return <div>{children}</div>;
  },
  projectRouteHandle: { enablePageHeader: false },
}));

vi.mock('#routes/w.$workspace.$project/project-live-sessions.js', () => ({
  ProjectChatRoute: () => <div>Project chat</div>,
}));

const workspaceRoute = await import('./route.js');
const testMatch = {
  id: 'test',
  pathname: '/',
  params: {},
  data: undefined,
  loaderData: {},
  handle: undefined,
} satisfies UIMatch;

describe('/w/{workspace}/{project}', () => {
  it('delegates URL resolution to the app-level project session host', () => {
    const Provider = workspaceRoute.handle.providers!(testMatch);
    render(
      <Provider>
        <div>Project content</div>
      </Provider>,
    );

    expect(screen.getByText('Project content')).toBeInTheDocument();
    expect(providerInputs).toEqual([{}]);
  });

  it('should render the project chat route after its module loads', async () => {
    render(<workspaceRoute.default />);

    expect(await screen.findByText('Project chat')).toBeInTheDocument();
  });
});
