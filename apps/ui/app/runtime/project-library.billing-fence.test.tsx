/**
 * Behaviour change B9 for the library and the chat store (app state orchestration plan § 4 A2, § 5; inventory S43).
 *
 * On an owner change `FinancialSessionScope` withholds its children for one commit, so everything below the billing
 * fence remounts. Before A2 `ProjectManagerProvider` and `ChatSessionStoreProvider` built the project-manager actor,
 * the workspace-connection actor and the chat store as React state there, and rebuilt them. The runtime builds them
 * now, above the fence, so across that remount they are the same instances. A query keyed by the owner is still
 * fetched again for the new owner, as before: the `QueryClient` was already above the fence.
 */
import { act, useEffect } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { flush } from '@taucad/xstate-testing/clock';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectLibraryFiles } from '#runtime/project-library.js';

const files = vi.hoisted(() => ({
  recordFiles: {
    readFile: async (): Promise<never> => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    writeFile: async () => undefined,
    exists: async () => false,
    readdir: async () => [],
    unlink: async () => undefined,
    rmdir: async () => undefined,
  },
  watchRecordFile: () => ({
    ready: Promise.resolve(),
    closed: Promise.withResolvers<void>().promise,
    dispose: () => undefined,
  }),
}));

/* The root file facade the provider binds; nothing in this row reads a record. */
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ ...files, workerChangeChannel: undefined }),
}));
vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));
vi.mock('#db/billing-snapshot-store.js', () => ({ purgeSavedUsage: async () => undefined }));

const { FinancialSessionProvider, FinancialSessionScope } = await import('#providers/financial-session-provider.js');
const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');
const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { AppRuntimeProvider } = await import('#runtime/app-runtime-provider.js');
const { createAppRuntime, selectRuntimeChatSessions, selectRuntimeProjectLibrary, selectRuntimeQueryClient } =
  await import('#runtime/app-runtime.js');
const { createFakeEnvironmentHost } = await import('#runtime/environment.fixture.js');

type Seen = {
  projectManagerRef: unknown;
  store: unknown;
  owner: string | undefined;
  mounts: number;
};

function Probe({ seen, ownerId }: { readonly seen: Seen; readonly ownerId: string }): undefined {
  seen.projectManagerRef = useProjectManager().projectManagerRef;
  seen.store = useChatSessionStore();
  const { data } = useQuery({ queryKey: ['owner-scoped', ownerId], queryFn: async () => ownerId });
  seen.owner = data;
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

describe('B9: the library and the chat store survive an owner change below the billing fence', () => {
  it('B9: keeps the library, its actors and the chat store as the same instances when the fence remounts from owner A to owner B, and fetches an owner-keyed query for owner B', async () => {
    const runtime = createAppRuntime({ environment: () => createFakeEnvironmentHost(), idleFileManagers: true });
    const library = selectRuntimeProjectLibrary(runtime);
    const seen: Seen = { projectManagerRef: undefined, store: undefined, owner: undefined, mounts: 0 };
    const at = (ownerId: string): React.JSX.Element => (
      <QueryClientProvider client={selectRuntimeQueryClient(runtime)}>
        <FinancialSessionProvider>
          <AppRuntimeProvider runtime={runtime}>
            <FinancialSessionScope identity={identityOf(ownerId)}>
              <ProjectManagerProvider>
                <ChatSessionStoreProvider>
                  <Probe seen={seen} ownerId={ownerId} />
                </ChatSessionStoreProvider>
              </ProjectManagerProvider>
            </FinancialSessionScope>
          </AppRuntimeProvider>
        </FinancialSessionProvider>
      </QueryClientProvider>
    );

    const view = render(at('owner-a'));
    await act(async () => {
      await flush();
    });
    expect(seen.mounts).toBe(1);
    expect(seen.owner).toBe('owner-a');
    const projectManagerA = seen.projectManagerRef;
    const storeA = seen.store;
    const connectionA = library.workspaceConnection;
    const filesA: ProjectLibraryFiles | undefined = library.files.get();
    expect(projectManagerA).toBe(library.projectManager);
    expect(storeA).toBe(selectRuntimeChatSessions(runtime));

    await act(async () => {
      view.rerender(at('owner-b'));
      await flush();
    });

    /* The subtree below the fence did remount: the row is not vacuous. */
    expect(seen.mounts).toBe(2);
    expect(seen.projectManagerRef).toBe(projectManagerA);
    expect(seen.store).toBe(storeA);
    expect(selectRuntimeProjectLibrary(runtime)).toBe(library);
    expect(library.workspaceConnection).toBe(connectionA);
    /* The remounted provider bound the library again, over the same facade. */
    expect(library.files.get()?.client).toBe(filesA?.client);
    /* The owner-keyed query is fetched again for the new owner. */
    await act(async () => {
      await vi.waitFor(() => {
        expect(seen.owner).toBe('owner-b');
      });
    });
    view.unmount();
    runtime.stop();
  });
});
