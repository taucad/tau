import * as React from 'react';
import { useLoaderData } from 'react-router';
import { createWorkspace } from '#filesystem/handle-store.js';
import { getEnvironment } from '#environment.config.js';
import { useFileManager } from '#hooks/use-file-manager.js';

const validFixture = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

export const loader = async ({ request }: { readonly request: Request }): Promise<{ readonly fixture: string }> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Not found', { status: 404 });
  }

  const fixture = new URL(request.url).searchParams.get('fixture') ?? '';
  if (!validFixture.test(fixture)) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Invalid fixture', { status: 400 });
  }
  return { fixture };
};

/** Seeds a genuine, structured-cloneable directory handle through production workspace APIs. */
export default function ProjectCreationLocationDebugRoute(): React.JSX.Element {
  const { fixture } = useLoaderData<typeof loader>();
  const fileManager = useFileManager();
  const [workspace, setWorkspace] = React.useState<{
    readonly workspaceId: string;
    readonly name: string;
    readonly slug: string;
  }>();
  const [error, setError] = React.useState<string>();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const seed = async (): Promise<void> => {
      try {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getDirectoryHandle(fixture, { create: true });
        const connected = await createWorkspace(handle);
        await fileManager.workspace.syncProjectRoots();
        setWorkspace(connected);
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    void seed();
  }, [fileManager.workspace, fixture]);

  if (error) {
    return <main role='alert'>Project creation location fixture failed: {error}</main>;
  }
  if (!workspace) {
    return <main role='status'>Preparing project creation location fixture…</main>;
  }

  return (
    <main
      role='status'
      data-testid='project-creation-location-fixture'
      data-fixture={fixture}
      data-workspace-id={workspace.workspaceId}
      data-workspace-name={workspace.name}
      data-workspace-slug={workspace.slug}
    >
      Project creation location fixture ready
    </main>
  );
}
