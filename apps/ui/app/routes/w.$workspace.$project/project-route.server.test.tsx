// @vitest-environment node
/**
 * Plan § 4 A5b Tests: a server render of a project URL derives `resolving` and calls no project hook (A5b review
 * round 15). The route's gate renders over an unstarted runtime with no window, as the server does.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import type * as FocusRouteStateModule from '#machines/focus.route-state.js';
import type * as ProjectHookModule from '#hooks/use-project.js';
import type * as ProjectWorkspaceWarmupModule from '#lib/project-workspace-warmup.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { ProjectSessionsHost } from '#routes/w.$workspace.$project/project-route.js';
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

it('should derive resolving for a project URL on the server and call no project hook', () => {
  const runtime = createAppRuntime({ environment: () => undefined });
  renderToString(
    <QueryClientProvider client={selectRuntimeQueryClient(runtime)}>
      <AppRuntimeProvider runtime={runtime}>
        <ProjectManagerProvider>
          <UnloadProvider>
            <ChatSessionStoreProvider>
              <SessionsProvider>
                <MemoryRouter initialEntries={['/w/ws/alpha?chat=c1']}>
                  <ProjectSessionsHost>
                    <p>editor</p>
                  </ProjectSessionsHost>
                </MemoryRouter>
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
