/**
 * `/w/{workspaceSlug}/{projectSlug}` — the canonical project URL (blueprint
 * D4). Slugs resolve to the `proj_` id, and everything downstream keeps
 * receiving that id (D6).
 *
 * Never add a static segment under `/w/`: it would shadow a workspace slug
 * (F13).
 */
import { useEffect, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { recoverFromCaughtError } from '#lib/stale-build-recovery.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteNotice } from '#routes/w.$workspace.$project/project-route-notices.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectRouteProviders, projectRouteHandle } from '#routes/w.$workspace.$project/project-route.js';
import type { ProjectChatRoute } from '#routes/w.$workspace.$project/project-live-sessions.js';

// Module-level for a stable component identity across HMR.
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  return <ProjectRouteProviders>{children}</ProjectRouteProviders>;
}

export const handle: Handle = {
  ...projectRouteHandle,
  providers: () => RouteProvider,
};

type EditorState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly Content: typeof ProjectChatRoute };

const loadProjectChatRoute = async (): Promise<{ ProjectChatRoute: typeof ProjectChatRoute }> =>
  import('#routes/w.$workspace.$project/project-live-sessions.js');

function DeferredProjectChatRoute(): React.JSX.Element {
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const [loadContent, setLoadContent] = useState(() => loadProjectChatRoute);
  useEffect(() => {
    const controller = new AbortController();
    // async-iife: bootstrap -- the mounted destination owns completion and explicit retry.
    void (async (): Promise<void> => {
      try {
        const { ProjectChatRoute: Content } = await loadContent();
        if (!controller.signal.aborted) {
          setState({ status: 'ready', Content });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          recoverFromCaughtError(error);
          setState({ status: 'failed' });
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [loadContent]);

  if (state.status === 'ready') {
    return <state.Content />;
  }
  if (state.status === 'failed') {
    return (
      <div role='alert' aria-label='Workspace unavailable' className='flex flex-col items-start gap-3 p-6'>
        <p>The workspace could not be loaded. Try again.</p>
        <Button
          variant='outline'
          onClick={() => {
            setState({ status: 'loading' });
            setLoadContent(() => async () => loadProjectChatRoute());
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  return <WorkspaceSkeleton />;
}

export default function WorkspaceProjectRoute(): React.JSX.Element {
  const state = useProjectRouteState();
  return state === undefined || state.kind === 'editor' ? (
    <DeferredProjectChatRoute />
  ) : (
    <ProjectRouteNotice state={state} />
  );
}
