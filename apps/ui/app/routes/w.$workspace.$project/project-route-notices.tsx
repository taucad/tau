/**
 * What the person sees when the project route is not the editor (blueprint W3).
 *
 * One flat table turns a `ProjectRouteState` into copy, one wrapper renders
 * every row the same way inside the retained app shell, and one hook binds the
 * table's closed set of action verbs to their real effects. The table never
 * learns an effect and the wrapper never learns a state kind, so a future state
 * is a union member, a case in `describeProjectRouteNotice` and a test row.
 */
import { createContext, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  DatabaseZap,
  Files,
  FolderClosed,
  FolderX,
  Hammer,
  MonitorDown,
  OctagonAlert,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';
import { tauDesktopDownloadUrl } from '#components/desktop/open-in-desktop.js';
import { Loader } from '#components/ui/loader.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { SidebarTrigger } from '#components/ui/sidebar.js';
import { toast } from '#components/ui/sonner.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useSessions } from '#hooks/use-sessions.js';
import { projectSessionIdleWindowMilliseconds } from '#machines/project-session.machine.js';
import type { ProjectSessionCloseReason } from '#machines/project-session.machine.js';
import type { ProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import type { PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';

/** Every verb a notice may offer. Closed on purpose: the table cannot invent an effect. @public */
export type NoticeActionRun = 'reopen' | 'restore' | 'retry' | 'back' | 'projects' | 'trash-view' | 'desktop';

/** One button in a notice's action row. Exactly one row member is primary. @public */
export type ProjectRouteNoticeAction = Readonly<{
  label: string;
  run: NoticeActionRun;
  icon?: LucideIcon;
  isPrimary?: boolean;
}>;

/** What one state looks like on screen. @public */
export type ProjectRouteNoticeSpec = Readonly<{
  /** `Loader` stands in for progress, which is why `PanelEmptyState.icon` widened. */
  icon: React.ComponentType<{ readonly className?: string }>;
  /** Colour lives on the glyph only: neutral = muted, soft-error = the feature ramp (DESIGN). */
  tone: 'neutral' | 'soft-error';
  /** `status` for progress, `alert` for a failure with an action, none for orientation. */
  live?: 'status' | 'alert';
  title: string;
  description: string;
  actions: readonly ProjectRouteNoticeAction[];
  details?: string;
}>;

const projectsPath = '/projects';
/* D1: the trashed view behind one query parameter. W6 replaces this literal with the shared helper. */
const projectsTrashPath = '/projects?trash=1';

const projectsAction: ProjectRouteNoticeAction = { label: 'Go to projects', run: 'projects', icon: Hammer };
const backAction: ProjectRouteNoticeAction = { label: 'Go back', run: 'back', icon: ArrowLeft };
const retryAction: ProjectRouteNoticeAction = { label: 'Try again', run: 'retry', icon: RefreshCw, isPrimary: true };
const libraryAction: ProjectRouteNoticeAction = { label: 'Open project library', run: 'projects', icon: Hammer };

const closedDescription = (reason: ProjectSessionCloseReason | undefined, idleWindowMilliseconds: number): string => {
  if (reason === 'idle') {
    /* The registry's real window, as the sidebar row already states it. */
    return `Closed to save memory after ${String(Math.round(idleWindowMilliseconds / 60_000))} min idle. Its files and chats are saved.`;
  }
  if (reason === 'budget') {
    return 'Closed to free memory for other projects. Its files and chats are saved.';
  }
  return 'Its files and chats are saved. Reopen it to continue where you left off.';
};

const recoveryFailure: Record<
  PendingProjectRecoveryReason,
  Omit<ProjectRouteNoticeSpec, 'tone' | 'live' | 'details'>
> = {
  'workspace-unavailable': {
    icon: Unplug,
    title: 'Setup paused',
    description: 'The project workspace is disconnected. Reconnect it and try again so Tau can finish setup.',
    actions: [retryAction, projectsAction],
  },
  'identity-conflict': {
    icon: Files,
    title: 'Folder belongs to another project',
    description: 'The directory holds different or unidentifiable content, so Tau did not finish this project.',
    actions: [{ ...libraryAction, isPrimary: true }, backAction],
  },
  'local-state-error': {
    icon: DatabaseZap,
    title: 'Local state could not be restored',
    description:
      "The project files were written, but this browser profile's record of the project could not be restored.",
    actions: [retryAction, libraryAction],
  },
  'filesystem-error': {
    icon: TriangleAlert,
    title: 'Setup did not finish',
    description: 'Tau could not finish writing the project files. Try again, or remove it from the project library.',
    actions: [retryAction, libraryAction],
  },
};

/**
 * The copy table: one case per state kind, and nothing else.
 *
 * @param state - What the route is showing.
 * @param idleWindowMilliseconds - The registry's idle window, for the closed-on-idle line.
 * @returns The notice to render, or undefined for the editor, which is not a notice.
 * @public
 */
export const describeProjectRouteNotice = (
  state: ProjectRouteState,
  idleWindowMilliseconds: number = projectSessionIdleWindowMilliseconds,
): ProjectRouteNoticeSpec | undefined => {
  switch (state.kind) {
    case 'editor': {
      return undefined;
    }
    case 'resolving': {
      /* Nothing to say yet: an empty title is what tells the renderer to show the workspace skeleton. */
      return { icon: Loader, tone: 'neutral', live: 'status', title: '', description: '', actions: [] };
    }
    case 'closed': {
      return {
        icon: FolderClosed,
        tone: 'neutral',
        title: 'Project closed',
        description: closedDescription(state.reason, idleWindowMilliseconds),
        actions: [{ label: 'Reopen project', run: 'reopen', isPrimary: true }],
      };
    }
    case 'trashed': {
      return {
        icon: Trash2,
        tone: 'neutral',
        title: 'Project is in Trash',
        description: 'Its files stay in place. Restore it to reopen the editor, or delete it permanently from Trash.',
        actions: [
          { label: 'Restore project', run: 'restore', isPrimary: true },
          { label: 'Open Trash', run: 'trash-view', icon: Trash2 },
        ],
      };
    }
    case 'missing': {
      return {
        icon: FolderX,
        tone: 'neutral',
        title: 'Project not found',
        description:
          'There is no project at this address in this workspace. It may have been renamed, moved or removed.',
        actions: [{ ...projectsAction, isPrimary: true }, backAction],
      };
    }
    case 'conflict': {
      return {
        icon: Files,
        tone: 'neutral',
        title: 'Two folders claim this project',
        description:
          'The same project id exists in more than one directory. Resolve it in the project library before opening.',
        actions: [{ ...libraryAction, isPrimary: true }, backAction],
      };
    }
    case 'unavailable': {
      return {
        icon: Unplug,
        tone: 'soft-error',
        live: 'alert',
        title: 'Storage unavailable',
        description:
          "The location holding this project's files is not reachable. Reconnect the drive or folder, then try again.",
        actions: [retryAction, projectsAction],
      };
    }
    case 'recovering': {
      return {
        icon: Loader,
        tone: 'neutral',
        live: 'status',
        title: 'Finishing setup',
        description: "Tau is still writing this project's files. The editor opens when it is done.",
        actions: [],
      };
    }
    case 'recovery-failed': {
      return { tone: 'soft-error', live: 'alert', ...recoveryFailure[state.reason] };
    }
    case 'native-kernel': {
      return {
        icon: MonitorDown,
        tone: 'neutral',
        title: `${state.kernelName} needs Tau Desktop`,
        description:
          'This project runs native code that the web runtime does not include. Open it in Tau Desktop to continue.',
        actions: [{ label: 'Get Tau Desktop', run: 'desktop', icon: MonitorDown, isPrimary: true }, projectsAction],
      };
    }
    case 'access-error': {
      return {
        icon: OctagonAlert,
        tone: 'soft-error',
        live: 'alert',
        title: "Couldn't check this project",
        description: 'Tau could not read the project library. Try again.',
        actions: [retryAction, backAction],
        details: state.error.message,
      };
    }
    case 'flush-error': {
      return {
        icon: TriangleAlert,
        tone: 'soft-error',
        live: 'alert',
        title: "Couldn't save the project view",
        description: 'The current project view was not saved before leaving. Try again before navigating on.',
        actions: [retryAction],
      };
    }
  }
};

/**
 * Restore, then let the gate re-resolve access from the library revision.
 * Nothing about the route state is patched here.
 */
const restoreFromTrash = async (
  projectManager: ReturnType<typeof useProjectManager>,
  projectId: string,
): Promise<void> => {
  try {
    await projectManager.restoreProject(projectId);
  } catch (error) {
    toast.error('Could not restore this project');
    console.error('Error restoring project:', error);
  }
};

/**
 * How a notice retries: the gate owns the attempt counter, so it supplies the
 * callback. The default is a no-op so the notice renders anywhere. @public
 */
export const ProjectRouteRetryContext = createContext<() => void>(() => undefined);

/**
 * Bind the table's verbs to their effects.
 *
 * @param projectId - The project the notice is about, when it has one.
 * @returns A runner for any `NoticeActionRun`.
 * @public
 */
export const useProjectRouteNoticeActions = (projectId: string | undefined): ((run: NoticeActionRun) => void) => {
  const navigate = useNavigate();
  const sessions = useSessions();
  const projectManager = useProjectManager();
  const retry = useContext(ProjectRouteRetryContext);

  return useCallback(
    (run: NoticeActionRun): void => {
      switch (run) {
        case 'reopen': {
          if (projectId !== undefined) {
            sessions.send({ type: 'open', projectId });
            sessions.send({ type: 'touch', projectId });
          }
          return;
        }
        case 'restore': {
          if (projectId !== undefined) {
            void restoreFromTrash(projectManager, projectId);
          }
          return;
        }
        case 'retry': {
          retry();
          return;
        }
        case 'back': {
          void navigate(-1);
          return;
        }
        case 'projects': {
          void navigate(projectsPath);
          return;
        }
        case 'trash-view': {
          void navigate(projectsTrashPath);
          return;
        }
        case 'desktop': {
          globalThis.open(tauDesktopDownloadUrl, '_blank', 'noopener,noreferrer');
        }
      }
    },
    [navigate, projectId, projectManager, retry, sessions],
  );
};

/** The pane header's label: the project by name, or the address that resolved to nothing. */
const noticeHeading = (state: ProjectRouteState): string => {
  if ('project' in state) {
    return state.project.name;
  }
  if (state.kind === 'missing' && state.slugs !== undefined) {
    return `${state.slugs.workspaceSlug}/${state.slugs.projectSlug}`;
  }
  return '';
};

/**
 * Render the notice for a non-editor project-route state.
 *
 * The route sets `enablePageHeader: false`, so this header owns the only
 * sidebar trigger on mobile.
 *
 * @param properties - The state the gate derived.
 * @returns The notice, or undefined for the editor state.
 * @public
 */
export const ProjectRouteNotice = ({ state }: { readonly state: ProjectRouteState }): React.JSX.Element | undefined => {
  const sessions = useSessions();
  const isMobile = useIsMobile();
  const runAction = useProjectRouteNoticeActions('projectId' in state ? state.projectId : undefined);
  const spec = describeProjectRouteNotice(state, sessions.getSnapshot().context.idleWindowMilliseconds);

  if (spec === undefined) {
    return undefined;
  }

  const heading = noticeHeading(state);
  const isProgressOnly = spec.title === '';

  /* Nothing to say yet, so this is the workspace arriving, not a notice about it: the same
   * skeleton the session gate shows next, rather than a spinner and a header that both vanish. */
  if (isProgressOnly) {
    return <WorkspaceSkeleton />;
  }

  return (
    <div data-slot='project-route-notice' className='flex h-full min-h-0 flex-col bg-background'>
      <header
        className={cn(
          'flex h-9 shrink-0 items-center gap-1 border-b bg-sidebar pr-1 pl-2 text-sm font-medium text-muted-foreground',
          // Same clearance the page header takes under the fixed titlebar controls.
          'md:group-data-[sidebar-open=false]/app-shell:pl-(--titlebar-controls-width)',
          isMobile && 'h-10',
        )}
      >
        {isMobile ? <SidebarTrigger aria-label='Toggle Sidebar' /> : null}
        {heading === '' ? null : <span className='truncate'>{heading}</span>}
      </header>
      <div className='flex min-h-0 flex-1 flex-col' role={spec.live} aria-busy={spec.live === 'status' || undefined}>
        <PanelEmptyState
          icon={spec.icon}
          iconClassName={cn(spec.tone === 'soft-error' && 'text-feature')}
          title={spec.title}
          description={spec.description}
          /* D2: PanelEmptyState's own mt-3 is tuned for small panes; a full route surface needs more air. */
          className='p-6 [&_[data-slot=panel-empty-state-copy]]:mt-6'
        >
          <div className='flex w-full max-w-sm flex-col items-center gap-4'>
            {spec.actions.length > 0 ? (
              <div className='flex flex-wrap items-center justify-center gap-2'>
                {spec.actions.map((action) => (
                  <Button
                    key={action.label}
                    type='button'
                    variant={action.isPrimary === true ? 'default' : 'outline'}
                    onClick={() => {
                      runAction(action.run);
                    }}
                  >
                    {action.icon ? <action.icon /> : null}
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {spec.details === undefined ? null : (
              <Collapsible className='w-full'>
                <CollapsibleTrigger asChild>
                  <Button type='button' variant='ghost' size='xs' className='text-muted-foreground'>
                    Details
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className='mt-2 max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-left font-mono text-xs whitespace-pre-wrap text-muted-foreground'>
                    {spec.details}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </PanelEmptyState>
      </div>
    </div>
  );
};
