// @vitest-environment node
/**
 * Plan § 4 A5b Tests: a server render of a project URL derives `resolving` and calls no project hook (A5b review
 * round 15). The route's gate renders over an unstarted runtime with no window, as the server does.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { DataMemoryRouter } from '#test-utils/data-memory-router.js';
import { expect, it, vi } from 'vitest';
import type * as FocusRouteStateModule from '#machines/focus.route-state.js';
import type * as ProjectHookModule from '#hooks/use-project.js';
import type * as ProjectWorkspaceWarmupModule from '#lib/project-workspace-warmup.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { ProjectRouteProviders, ProjectSessionsHost } from '#routes/w.$workspace.$project/project-route.js';
import { WorkspaceFrame } from '#routes/w.$workspace.$project/workspace-frame.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import { createAppRuntime, selectRuntimeQueryClient } from '#runtime/app-runtime.js';

/* The server reads its environment from the process, as the deployed render does. */
vi.hoisted(() => {
  vi.stubEnv('TAU_API_URL', 'http://localhost:4000');
  vi.stubEnv('TAU_WEBSOCKET_URL', 'ws://localhost:4001');
  vi.stubEnv('TAU_FRONTEND_URL', 'http://localhost:3000');
});
const seen = vi.hoisted(() => ({
  states: [] as Array<ProjectRouteState | undefined>,
  projectHook: 0,
  workspaceImport: 0,
}));
vi.mock('#machines/focus.route-state.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FocusRouteStateModule>();
  return {
    ...actual,
    selectProjectRouteState: (...args: Parameters<typeof actual.selectProjectRouteState>) => {
      const state = actual.selectProjectRouteState(...args);
      seen.states.push(state);
      return state;
    },
  };
});
vi.mock('#hooks/use-project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectHookModule>();
  return {
    ...actual,
    useProject: (...args: Parameters<typeof actual.useProject>) => {
      seen.projectHook += 1;
      return actual.useProject(...args);
    },
  };
});
vi.mock('#lib/project-workspace-warmup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectWorkspaceWarmupModule>();
  return {
    ...actual,
    // oxlint-disable-next-line @typescript-eslint/promise-function-async -- passes the module's own promise through.
    loadProjectWorkspace: () => {
      seen.workspaceImport += 1;
      return actual.loadProjectWorkspace();
    },
  };
});

/** The server HTML of a project URL, with `shell` where the root layout puts the app shell. */
const renderProjectUrl = (shell: React.ReactNode): string => {
  const runtime = createAppRuntime({ environment: () => undefined });
  return renderToString(
    <QueryClientProvider client={selectRuntimeQueryClient(runtime)}>
      <AppRuntimeProvider runtime={runtime}>
        <ProjectManagerProvider>
          <UnloadProvider>
            <ChatSessionStoreProvider>
              <SessionsProvider>
                <DataMemoryRouter initialEntries={['/w/ws/alpha?chat=c1']}>
                  <ProjectSessionsHost>{shell}</ProjectSessionsHost>
                </DataMemoryRouter>
              </SessionsProvider>
            </ChatSessionStoreProvider>
          </UnloadProvider>
        </ProjectManagerProvider>
      </AppRuntimeProvider>
    </QueryClientProvider>,
  );
};

/* A11 (D24, U3's server half): the shell is outside the worker gate, so the server renders it with the route's
 * `resolving` content (the workspace's placeholder) in its outlet. A15b2: the shell hosts the workspace frame (`Page`)
 * and the route draws none of its own, so the server HTML holds exactly one. */
it('should render the app shell and the resolving content in the server HTML of a project URL', () => {
  const html = renderProjectUrl(
    <nav data-testid='app-shell'>
      <WorkspaceFrame>
        <ProjectRouteProviders>
          <p>outlet</p>
        </ProjectRouteProviders>
      </WorkspaceFrame>
    </nav>,
  );
  /* No DOM on the server: the shell's own markup, from its opening tag to its close. */
  const shell = /<nav data-testid="app-shell">([\s\S]*)<\/nav>/u.exec(html)?.[1];
  expect(shell, 'U3: the server HTML lacks the app shell').toBeDefined();
  expect(shell).toContain('data-slot="workspace-frame"');
  expect(shell).toContain('data-slot="workspace-lane"');
  expect(shell?.match(/data-slot="workspace-frame"/gu)).toHaveLength(1);
  expect(shell).toContain('data-testid="workspace-opening"');
  expect(seen.projectHook).toBe(0);
});

it('should derive resolving for a project URL on the server and call no project hook', () => {
  const runtime = createAppRuntime({ environment: () => undefined });
  renderToString(
    <QueryClientProvider client={selectRuntimeQueryClient(runtime)}>
      <AppRuntimeProvider runtime={runtime}>
        <ProjectManagerProvider>
          <UnloadProvider>
            <ChatSessionStoreProvider>
              <SessionsProvider>
                <DataMemoryRouter initialEntries={['/w/ws/alpha?chat=c1']}>
                  <ProjectSessionsHost>
                    <p>editor</p>
                  </ProjectSessionsHost>
                </DataMemoryRouter>
              </SessionsProvider>
            </ChatSessionStoreProvider>
          </UnloadProvider>
        </ProjectManagerProvider>
      </AppRuntimeProvider>
    </QueryClientProvider>,
  );
  expect(seen.states.length).toBeGreaterThan(0);
  expect(seen.states.map((state) => state?.kind)).toEqual(seen.states.map(() => 'resolving'));
  expect({ projectHook: seen.projectHook, workspaceImport: seen.workspaceImport }).toEqual({
    projectHook: 0,
    workspaceImport: 0,
  });
});
