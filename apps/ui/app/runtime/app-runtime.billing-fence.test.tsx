/**
 * Behaviour change B9 (app state orchestration plan § 5; inventory S43; charter D5).
 *
 * On an owner change `FinancialSessionScope` withholds its children for one commit, so everything below the billing
 * fence remounts. Before A1a the sessions registry was React state there (`useState(() => createSessionsActor()
 * .start())` in `SessionsProvider`) and was rebuilt with every live session dropped. The runtime now sits in a
 * module holder above the fence, so across that remount the registry and a live session are the same instances.
 */
import { act, useEffect } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { FinancialSessionProvider, FinancialSessionScope } from '#providers/financial-session-provider.js';
import { SessionsProvider, useProjectSession, useSessions } from '#hooks/use-sessions.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import { createAppRuntime } from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import { reportRegionReady } from '#services/sessions-store.js';

vi.mock('#hooks/use-file-manager.js', () => ({ useSharedFileManagerWorker: () => undefined }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
vi.mock('#db/billing-snapshot-store.js', () => ({ purgeSavedUsage: async () => undefined }));

type Seen = { registry: unknown; session: unknown; mounts: number };

function Probe({ seen }: { readonly seen: Seen }): undefined {
  const registry = useSessions();
  seen.registry = registry;
  seen.session = useProjectSession('p1');
  useEffect(() => {
    seen.mounts += 1;
  }, [seen]);
  return undefined;
}

const identityOf = (ownerId: string): { apiBaseUrl: string; environment: string; ownerId: string } => ({
  apiBaseUrl: 'https://api.example.test',
  environment: 'development',
  ownerId,
});

describe('B9: the runtime survives an owner change below the billing fence', () => {
  it('B9: keeps the registry and a live session as the same instances when the fence remounts from owner A to owner B', async () => {
    const runtime = createAppRuntime({ environment: () => createFakeEnvironmentHost() });
    const queryClient = new QueryClient();
    const seen: Seen = { registry: undefined, session: undefined, mounts: 0 };
    const at = (ownerId: string): React.JSX.Element => (
      <QueryClientProvider client={queryClient}>
        <FinancialSessionProvider>
          <AppRuntimeProvider runtime={runtime}>
            <FinancialSessionScope identity={identityOf(ownerId)}>
              <UnloadProvider>
                <SessionsProvider>
                  <Probe seen={seen} />
                </SessionsProvider>
              </UnloadProvider>
            </FinancialSessionScope>
          </AppRuntimeProvider>
        </FinancialSessionProvider>
      </QueryClientProvider>
    );

    const view = render(at('owner-a'));
    const registryA = seen.registry as ReturnType<typeof useSessions>;
    await act(async () => {
      registryA.send({ type: 'open', projectId: 'p1' });
      reportRegionReady('p1', 'views');
      reportRegionReady('p1', 'runtime');
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(registryA.getSnapshot().context.status['p1']?.state).toBe('live');
    });
    const sessionA = seen.session;
    expect(sessionA).toBeDefined();
    expect(seen.mounts).toBe(1);

    await act(async () => {
      view.rerender(at('owner-b'));
      await Promise.resolve();
    });

    /* The subtree below the fence did remount: the row is not vacuous. */
    expect(seen.mounts).toBe(2);
    expect(seen.registry).toBe(registryA);
    expect(seen.session).toBe(sessionA);
    expect(registryA.getSnapshot().context.status['p1']?.state).toBe('live');
    view.unmount();
    runtime.stop();
  });
});
