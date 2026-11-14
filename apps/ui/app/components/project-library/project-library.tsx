import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Grid, ArrowRight, Table as TableIcon, Trash, AlertCircle, PackageX, FolderOpen, House } from 'lucide-react';
import { NavLink, useNavigate, useNavigation } from 'react-router';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, VisibilityState, SortingState } from '@tanstack/react-table';
import type { ProjectLocator, ProjectDiscoveryIssue } from '@taucad/filesystem';
import { describeProjectManifestIssue } from '@taucad/types';
import type { ProjectListItem } from '#types/project-library.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import { createColumns } from '#components/project-library/columns.js';
import { Button, buttonVariants } from '@taucad/ui/components/button';
import { Card, CardHeader, CardFooter } from '@taucad/ui/components/card';
import {
  DataTable,
  DataTableSearch,
  DataTablePagination,
  DataTableSortingDropdown,
  DataTableColumnVisibilityDropdown,
} from '@taucad/ui-kit/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectListShape } from '#hooks/use-project-list-shape.js';
import { toast } from '@taucad/ui/components/sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@taucad/ui/components/alert-dialog';
import { useCookie } from '#hooks/use-cookie.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { isFunction } from '@taucad/ui-core/utils/function.utils';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import { ProjectActionMenu } from '#components/project-library/project-cloud-delete.js';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { formatRelativeTime } from '@taucad/ui-core/utils/date.utils';
import { Loader } from '@taucad/ui/components/loader';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { flagParameter, stringParameter, enumParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import type { InlineTextEditorHandle } from '#components/inline-text-editor.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitClock, useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { indicatorDelayMilliseconds } from '@taucad/ui/utils/wait-timing';
import type { WaitIndicatorTiming } from '@taucad/ui/utils/wait-timing';
import { useNetworkConnectivity } from '#hooks/use-network-connectivity.js';
import type { ProjectDiscoveryConflict, WorkspaceBindingRepairGroup } from '#runtime/project-library-storage.js';
import {
  ProjectCard,
  ProjectCardCadPreview,
  ProjectCardMedia,
  projectCardVerticalFieldOfView,
} from '#components/project-card.js';
import { projectGridClassName } from '#components/project-grid-layout.js';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader, SectionHeader, usePhoneTopBar } from '#components/layout/page-header.js';
import { projectSlugOf, projectUrlOr } from '#utils/project-url.utils.js';
import { projectLocationDescriptor, projectLocationFullLabel } from '#utils/project-creation-location.utils.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { assertCloudProjectActive, useCloudProjects } from '#hooks/use-cloud-projects.js';
import type { CloudListingState, CloudProject } from '#hooks/use-cloud-projects.js';
import { useOpenCloudProject } from '#hooks/use-open-cloud-project.js';
import {
  CloudProjectCard,
  OnTauCloudMark,
  isCloudOnly,
  toLibraryRows,
  useMaterializeCloudProjects,
} from '#routes/projects_/cloud-projects.js';
import type { LibraryRow } from '#routes/projects_/cloud-projects.js';
import type { RememberedPlace, RememberedProject } from '#lib/project-list-shape.lib.js';

// Note: useCookie is still used for projectViewMode (user preference, not per-build state)

export type ProjectActions = {
  handleDelete: (project: ProjectListItem, options?: { announce?: boolean }) => Promise<boolean>;
  handlePermanentlyDelete: (project: ProjectListItem) => void;
  handleDuplicate: (project: ProjectListItem) => Promise<void>;
  handleRename: (projectId: string, newName: string) => Promise<void>;
  handleRestore: (project: ProjectListItem) => void;
};

/** Physical directory an unfinished operation is stuck on. */
const recoveryDirectoryName = (recovery: PendingProjectRecovery): string =>
  recovery.storage.providerBasePath.split('/').findLast(Boolean) ?? recovery.storage.providerBasePath;

/** Why a discovered directory does not open, and what gets it open again. */
const conflictSummary = (conflict: ProjectDiscoveryConflict): string => {
  switch (conflict.status) {
    case 'adoption-required': {
      return conflict.issue.code === 'manifest-missing'
        ? 'tau.json is missing. Adopt writes a new one so this folder opens as a project again.'
        : 'This folder needs a valid tau.json before it can be opened.';
    }
    case 'duplicate-id': {
      return 'This copied project shares an identity with another directory. Choose which folder Tau opens.';
    }
    case 'route-blocked': {
      return 'This project’s workspace is not connected. Reconnect the folder to open it.';
    }
    case 'invalid': {
      switch (conflict.issue.code) {
        case 'identity-conflict': {
          return 'This folder’s saved identity disagrees with its existing project. Resolve the conflict before opening it.';
        }
        case 'identity-invalid': {
          return 'This folder’s saved project identity is damaged. Restore its project metadata before opening it.';
        }
        case 'identity-unavailable': {
          return 'Tau could not save this folder’s project identity. Check folder access and try again.';
        }
        case 'manifest-unreadable': {
          return 'This project directory could not be read.';
        }
        case 'manifest-too-large': {
          return 'tau.json is too large to be a Tau manifest, so the project was not opened.';
        }
        case 'manifest-unknown-schema': {
          return 'tau.json uses a format this version of Tau does not support. Update Tau to open it.';
        }
        default: {
          return 'The tau.json manifest is invalid and was not opened.';
        }
      }
    }
  }
};

const maxIssueLines = 4;

/** The exact manifest defects, so a person or an agent can fix the right key. */
function ManifestIssueLines({ issue }: { readonly issue: ProjectDiscoveryIssue }): React.JSX.Element | undefined {
  if (
    issue.code === 'identity-conflict' ||
    issue.code === 'identity-invalid' ||
    issue.code === 'identity-unavailable'
  ) {
    return undefined;
  }
  const lines = [...new Set(describeProjectManifestIssue(issue))];
  return (
    <ul className='mt-1 space-y-0.5 font-mono text-xs text-muted-foreground'>
      {lines.slice(0, maxIssueLines).map((line) => (
        <li key={line} className='truncate'>
          {line}
        </li>
      ))}
      {lines.length > maxIssueLines ? <li>…and {lines.length - maxIssueLines} more</li> : null}
    </ul>
  );
}

/**
 * The project library: this device's projects and the account's Tau Cloud
 * projects in one list, each with the glyphs of where it is (charter D20).
 *
 * @returns The library.
 */
/** The library's primary action: in its title row, and in the phone top bar on `/projects` at 40px. */
export function NewProjectLink({
  size,
  isDeferredToPhoneBar = false,
}: Pick<React.ComponentProps<typeof Button>, 'size'> & {
  /** Hide below `md` while the phone top bar carries this action, so phones get one copy (I4). */
  readonly isDeferredToPhoneBar?: boolean;
}): React.JSX.Element {
  const isInPhoneBar = usePhoneTopBar().hasAction && isDeferredToPhoneBar;
  return (
    <Button asChild size={size} className={cn(isInPhoneBar && 'max-md:hidden')} data-slot='new-project-link'>
      <NavLink to='/'>
        {({ isPending }) => (
          <>
            New project
            {isPending ? <Loader /> : null}
          </>
        )}
      </NavLink>
    </Button>
  );
}

/**
 * The last listing's count (R5), which the server also read from its cookie, and on the client the projects the
 * listing snapshot remembered (A15g). The Trash is a different list, so it keeps the unknown shape.
 *
 * @param isShowingDeleted - Whether the library shows the Trash.
 * @returns The count to reserve, or `undefined` when unknown, and the remembered projects, when the snapshot has them.
 */
function useRememberedLibrary(isShowingDeleted: boolean): {
  readonly count: number | undefined;
  readonly projects: readonly RememberedProject[] | undefined;
} {
  const rememberedShape = useProjectListShape();
  return isShowingDeleted
    ? { count: undefined, projects: undefined }
    : { count: rememberedShape?.count, projects: rememberedShape?.projects };
}

export function ProjectLibrary({
  headingLevel = 1,
  emptyContent,
}: {
  readonly headingLevel?: 1 | 2;
  /** Replaces the whole section while the library has nothing to show or say. */
  readonly emptyContent?: ReactNode;
}): React.ReactNode {
  const [viewMode, setViewMode] = useCookie<'grid' | 'table'>(cookieName.projectViewMode, 'grid');
  /*
   * D1: the Trash is a place, not a menu tick. `/projects?trash=1` is what the
   * trashed project's notice links to and what a person can bookmark or send,
   * so the view lives in the URL rather than in component state that a reload
   * throws away.
   */
  const [showDeleted, setShowDeleted] = useSearchParameter(searchParameterName.trash, flagParameter);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ProjectListItem | undefined>();
  const [repairTarget, setRepairTarget] = useState<WorkspaceBindingRepairGroup | undefined>();
  /* Everything this device holds, the Trash included — one listing under the
     same query key — so a trashed project is never offered as Tau Cloud's alone. */
  const { projects: heldProjects } = useProjects({ includeDeleted: true });
  const {
    projects,
    conflicts,
    recoveries,
    workspaceBindingRepairs,
    error: listingError,
    retry,
    deleteProject,
    verifyProjectQuiescent,
    duplicateProject,
    restoreProject,
    permanentlyDeleteProject: deleteProjectPermanently,
    adoptProject,
    repairProject,
    chooseProjectDirectory,
    updateName,
    isLoading,
  } = useProjects({ includeDeleted: showDeleted });
  const { count: rememberedCount, projects: rememberedProjects } = useRememberedLibrary(showDeleted);
  const degradedProjects = projects.filter(
    (project) => project.manifestIssue !== undefined && project.deletedAt === undefined,
  );
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const {
    projects: cloudProjects,
    isSettled: isCloudSettled,
    isFetching: isCloudFetching,
    isFailed: isCloudFailed,
    cloud,
    retry: retryCloud,
  } = useCloudProjects();
  const auth = useResolvedAuth();
  const rows = toLibraryRows({ projects, held: heldProjects, cloud: cloudProjects, includeCloudOnly: !showDeleted });
  /* P-g: the wait for the listing is the header's trailing slot, shown after 1,000 ms, over remembered cards or the
     empty frames alike; the grid itself is busy for as long. */
  const isAwaitingListing = isLoading && projects.length === 0 && (rows.length > 0 || rememberedCount !== 0);
  /* Read before the host's empty-content return below, so the hooks run in one order. */
  const phoneTopBar = usePhoneTopBar();
  const isHeaderInPhoneBar = phoneTopBar.hasTitle && phoneTopBar.hasAction;
  const cloudPending = auth === 'authed' && !isCloudSettled && !isCloudFailed;
  const isOnline = useNetworkConnectivity();
  const waitClock = useWaitClockSource();
  /* P-k: Tau Cloud's state shares the header's slot. Its first listing, or one a Retry asks for, is a wait; a later
     refresh over listed projects is not, because the cards are already the answer. Offline and failed are said in
     words, with Retry for the failure. */
  const isCloudShown = !showDeleted && auth === 'authed';
  const cloudNotice: CloudNotice | undefined = isCloudShown
    ? cloudNoticeOf({ isOnline, isCloudSettled, cloud })
    : undefined;
  /* The time of the latest Retry press while its request runs: each press is a new request, so a new wait. */
  const [cloudRetriedAt, setCloudRetriedAt] = useState<number>();
  /* A Retry's own request is a wait even over listed projects, whose failed refresh stays `failed` while it asks. */
  const isAwaitingCloud =
    isCloudShown && ((cloudPending && cloud === 'fetching') || (cloudRetriedAt !== undefined && isCloudFetching));
  /* Whether the listing's last answer was a failure, so a wait that follows it keeps the failure's Retry. */
  const [hasCloudFailed, setHasCloudFailed] = useState(false);
  if (cloud === 'failed' && !hasCloudFailed) {
    setHasCloudFailed(true);
  } else if (isCloudSettled && hasCloudFailed) {
    /* Only an answer clears it: a paused request (a hidden tab) reads `ready` but has not answered. */
    setHasCloudFailed(false);
  }
  /* A wait is timed from when this library saw it begin, so one that begins well into the page (a client navigation
     to Home, a Retry, another account) starts its own 1,000 ms. A wait a Retry started is announced by the
     slot's status region; any other by its indicator, once revealed. */
  const [cloudWait, setCloudWait] = useState<CloudWait>();
  if (isAwaitingCloud && cloudWait === undefined) {
    setCloudWait({
      startedAt: cloudRetriedAt ?? waitClock.now(),
      isAnnounced: cloudRetriedAt !== undefined,
      retriedAt: cloudRetriedAt,
      followsFailure: hasCloudFailed,
    });
  } else if (!isAwaitingCloud && cloudWait !== undefined) {
    setCloudWait(undefined);
    setCloudRetriedAt(undefined);
  } else if (cloudWait !== undefined && cloudRetriedAt !== undefined && cloudWait.retriedAt !== cloudRetriedAt) {
    /* A Retry pressed during a wait, slow or not, starts a wait of its own, timed and announced from the press. */
    setCloudWait({ startedAt: cloudRetriedAt, isAnnounced: true, retriedAt: cloudRetriedAt, followsFailure: true });
  }
  /* When the local listing's wait handed the slot to a running Tau Cloud wait, so a shown indicator stays shown. */
  const [wasAwaitingListing, setWasAwaitingListing] = useState(isAwaitingListing);
  const [listingHandoverAt, setListingHandoverAt] = useState<number>();
  if (wasAwaitingListing !== isAwaitingListing) {
    setWasAwaitingListing(isAwaitingListing);
    if (!isAwaitingListing && isAwaitingCloud) {
      setListingHandoverAt(waitClock.now());
    }
  } else if (!isAwaitingCloud && listingHandoverAt !== undefined) {
    setListingHandoverAt(undefined);
  }
  const cloudShownFrom = shownFromOf({ wait: cloudWait, listingHandoverAt });
  /* The slot's one Retry shows beside the first wait's slow words at the slow mark, as the indicator's own would. */
  /* Active once the wait's start is recorded, so this render, which may still be recording it, times nothing from 0. */
  const { timing: cloudWaitTiming } = useWaitClock({
    /* The listing's own wait holds the slot until it answers, so the Retry is timed from when it can show. */
    active: isAwaitingCloud && cloudWait !== undefined && !isAwaitingListing,
    startedAt: cloudShownFrom,
  });
  /* A shown wait that ends keeps its indicator for its 500 ms minimum, so a failure is said once that hold is over. */
  const [releasedCloudHold, setReleasedCloudHold] = useState<WaitIndicatorTiming>();
  const isCloudWaitHolding = cloudWaitTiming.state === 'holding' && releasedCloudHold !== cloudWaitTiming;
  useEffect(() => {
    if (cloudWaitTiming.state !== 'holding') {
      return;
    }
    const timer = setTimeout(() => {
      setReleasedCloudHold(cloudWaitTiming);
    }, Number.parseFloat(cloudWaitTiming.hideDelay));
    return () => {
      clearTimeout(timer);
    };
  }, [cloudWaitTiming]);
  /* On a phone whose top bar carries the /projects header, the header row is visually hidden until a notice is shown;
     once shown, it stays for this page view, so a Retry or a recovery does not move the grid again. */
  const [hasShownCloudNotice, setHasShownCloudNotice] = useState(false);
  /* The press lasts as long as the Retry's own request, so a Retry that starts no wait (a failed refresh over listed
     projects) leaves nothing behind for a later one; an earlier press's end does not clear a later one. */
  const latestCloudRetry = useRef<number>(undefined);
  const retryCloudListing = useCallback(async () => {
    const pressedAt = waitClock.now();
    latestCloudRetry.current = pressedAt;
    setCloudRetriedAt(pressedAt);
    try {
      await retryCloud();
    } finally {
      if (latestCloudRetry.current === pressedAt) {
        setCloudRetriedAt(undefined);
      }
    }
  }, [retryCloud, waitClock]);
  const handleRetryCloud = useCallback(() => {
    void retryCloudListing();
  }, [retryCloudListing]);
  const openCloudProject = useOpenCloudProject();
  useMaterializeCloudProjects({
    cloud: cloudProjects,
    isSettled: isCloudSettled,
    isFetching: isCloudFetching,
    held: heldProjects,
    isLoading,
  });
  const handleOpenCloudProject = useCallback(
    async (entry: CloudProject): Promise<void> => {
      try {
        await assertCloudProjectActive(entry.id);
        await openCloudProject(entry);
      } catch (error) {
        toast.error(`Could not open ${entry.name} from Tau Cloud`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [openCloudProject],
  );

  const handleToggleDeleted = useCallback(
    (value: boolean) => {
      setShowDeleted(value);
    },
    [setShowDeleted],
  );

  // The toast follows the mutation, never precedes it: a row that has already
  // vanished is a failure, not a silent success (DF3).
  const trashProject = useCallback(
    async (project: ProjectListItem, announce = true): Promise<boolean> => {
      try {
        const trashed = await deleteProject(project.id);
        if (trashed) {
          if (announce) {
            toast.success(`Moved ${project.name} to Trash`, {
              description: 'Its files remain on disk and can be restored from Trash.',
            });
          }
          return true;
        }
        if (announce) {
          toast.error(`Could not move ${project.name} to Trash`);
        }
      } catch (error) {
        if (announce) {
          toast.error(`Could not move ${project.name} to Trash`, {
            description: error instanceof Error ? error.message : undefined,
          });
        }
        console.error('Error trashing project:', error);
      }
      return false;
    },
    [deleteProject],
  );

  const handleDelete = useCallback(
    async (project: ProjectListItem, options?: { announce?: boolean }): Promise<boolean> => {
      return trashProject(project, options?.announce);
    },
    [trashProject],
  );

  const handlePermanentlyDelete = useCallback(
    async (project: ProjectListItem) => {
      try {
        await verifyProjectQuiescent(project.id);
        setPermanentDeleteTarget(project);
      } catch (error) {
        toast.error(`Could not delete ${project.name} permanently`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [verifyProjectQuiescent],
  );

  const handleDiscardRecovery = useCallback(
    async (operationId: string): Promise<void> => {
      try {
        await projectManager.discardRecovery(operationId);
      } catch (error) {
        toast.error('Could not discard the unfinished operation');
        console.error('Error discarding recovery:', error);
      }
    },
    [projectManager],
  );

  const handleAdopt = useCallback(
    async (locator: ProjectLocator, name: string): Promise<void> => {
      try {
        await adoptProject(locator);
        toast.success(`Adopted ${name}`);
      } catch (error) {
        toast.error(`Could not adopt ${name}`);
        console.error('Error adopting project:', error);
      }
    },
    [adoptProject],
  );

  const handleRepair = useCallback(
    async (project: ProjectListItem): Promise<void> => {
      try {
        await repairProject(project.id);
        toast.success(`Repaired ${project.name}`);
      } catch (error) {
        toast.error(`Could not repair ${project.name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
        console.error('Error repairing project manifest:', error);
      }
    },
    [repairProject],
  );

  const handleChooseDirectory = useCallback(
    async (locator: ProjectLocator, projectId: string, name: string): Promise<void> => {
      try {
        await chooseProjectDirectory(locator, projectId);
        toast.success(`Tau now opens ${name} from this folder`);
      } catch (error) {
        toast.error(`Could not open ${name} from this folder`, {
          description: error instanceof Error ? error.message : undefined,
        });
        console.error('Error choosing project directory:', error);
      }
    },
    [chooseProjectDirectory],
  );

  const confirmPermanentDelete = useCallback(async () => {
    const project = permanentDeleteTarget;
    if (!project) {
      return;
    }
    try {
      await deleteProjectPermanently(project.id);
      setPermanentDeleteTarget(undefined);
      toast.success(`Permanently deleted ${project.name}`);
    } catch (error) {
      toast.error(`Could not permanently delete ${project.name}`, {
        description: error instanceof Error ? error.message : undefined,
      });
      console.error('Error permanently deleting project:', error);
    }
  }, [deleteProjectPermanently, permanentDeleteTarget]);

  const confirmWorkspaceBindingRepair = useCallback(async (): Promise<void> => {
    const target = repairTarget;
    if (!target) {
      return;
    }
    try {
      const result = await projectManager.repairWorkspaceBindings(target.canonicalWorkspaceId);
      if (result.repairedProjectCount > 0) {
        toast.success(
          `Repaired ${result.repairedProjectCount} project ${result.repairedProjectCount === 1 ? 'link' : 'links'}`,
        );
      } else {
        toast.info('Project links changed before repair. Nothing was updated.');
      }
      setRepairTarget(undefined);
    } catch (error) {
      toast.error('Could not repair project links');
      console.error('Error repairing workspace bindings:', error);
    }
  }, [projectManager, repairTarget]);

  const handleDuplicate = useCallback(
    async (project: ProjectListItem) => {
      try {
        await duplicateProject(project.id);
        toast.success(`Duplicated ${project.name}`, {
          action: {
            label: 'Open',
            onClick() {
              void navigate(projectUrlOr(project.slugs));
            },
          },
        });
      } catch (error) {
        toast.error('Failed to duplicate project');
        console.error('Error in component:', error);
      }
    },
    [duplicateProject, navigate],
  );

  const restoreFromTrash = useCallback(
    async (project: ProjectListItem): Promise<void> => {
      try {
        await restoreProject(project.id);
        toast.success(`Restored ${project.name}`);
      } catch (error) {
        toast.error(`Could not restore ${project.name}`);
        console.error('Error restoring project:', error);
      }
    },
    [restoreProject],
  );

  const handleRestore = useCallback(
    (project: ProjectListItem) => {
      void restoreFromTrash(project);
    },
    [restoreFromTrash],
  );

  const handleRename = useCallback(
    async (projectId: string, newName: string) => {
      try {
        await updateName(projectId, newName);
        toast.success(`Renamed to ${newName}`);
      } catch (error) {
        toast.error('Failed to rename project', {
          description: error instanceof Error ? error.message : undefined,
        });
        console.error('Error renaming project:', error);
      }
    },
    [updateName],
  );

  const actions = useMemo<ProjectActions>(
    () => ({ handleDelete, handlePermanentlyDelete, handleDuplicate, handleRename, handleRestore }),
    [handleDelete, handlePermanentlyDelete, handleDuplicate, handleRename, handleRestore],
  );

  const viewControls = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon' aria-label='View mode'>
          {viewMode === 'grid' ? <Grid /> : <TableIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuCheckboxItem
          checked={viewMode === 'grid'}
          onCheckedChange={() => {
            setViewMode('grid');
          }}
        >
          Grid
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={viewMode === 'table'}
          onCheckedChange={() => {
            setViewMode('table');
          }}
        >
          Table
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const isCatalogUnavailable = !showDeleted && auth === 'authed' && (cloudPending || isCloudFailed);
  /* A host with its own empty content (Home) shows it in place of an empty section. The section stays
     whenever it has something to say: the Trash, a failure, a repair, or Tau Cloud still listing. An
     unknown count counts as empty, so a first visit does not paint cards that then vanish. */
  const hasNotice = Boolean(listingError) || workspaceBindingRepairs.length + conflicts.length + recoveries.length > 0;
  if (
    emptyContent !== undefined &&
    rows.length === 0 &&
    !showDeleted &&
    !isCatalogUnavailable &&
    !hasNotice &&
    (!isLoading || (rememberedCount ?? 0) === 0)
  ) {
    return emptyContent;
  }

  /* The latch reads the notice the slot shows, not one the listing's own wait still holds back. */
  /* A Retry's wait over a failure says the wait, not the failure, until its own request answers. */
  const isFailureHeld = cloudNotice === 'failed' && (cloudWait?.isAnnounced === true || isCloudWaitHolding);
  const shownCloudNotice = isAwaitingListing || isFailureHeld ? undefined : cloudNotice;
  if (shownCloudNotice !== undefined && !hasShownCloudNotice) {
    setHasShownCloudNotice(true);
  }
  /* The slot takes the header row's spare width and clips there, so its words never wrap the row (P-k's slot rule). */
  const statusSlot = (
    /* The listing's own wait keeps the slot while it runs: until it answers, there are no projects on this device to
       speak of, and its slow words and Retry stay reachable. */
    <LibraryStatusSlot
      notice={shownCloudNotice}
      /* A Retry's wait is announced by the slot's status region, there before the press, so the words are heard. */
      announcement={!isAwaitingListing && cloudWait?.isAnnounced === true ? 'Loading Tau Cloud projects' : undefined}
      /* One Retry for Tau Cloud: beside a failure, through the wait it starts, and from the first wait's slow mark, so a
         Retry whose request fails or waits keeps its focus. */
      retry={
        isAwaitingListing
          ? undefined
          : cloudRetryOf({
              /* A failure held behind its wait's minimum already offers its Retry, so the control does not leave. */
              notice: isFailureHeld ? 'failed' : shownCloudNotice,
              wait: cloudWait,
              timing: cloudWaitTiming,
            })
      }
      onRetryCloud={handleRetryCloud}
    >
      <WaitIndicator
        className='min-w-0 justify-end overflow-hidden'
        /* The sidebar's Recents label announces the local listing's wait, and the slot's status region a Retry's (one
           announcement per group); the indicator announces any other Tau Cloud wait, once its words are revealed. */
        live={!isAwaitingListing && cloudWait?.isAnnounced !== true}
        active={isAwaitingListing || isAwaitingCloud}
        startedAt={isAwaitingListing ? 0 : cloudShownFrom}
        label={isAwaitingListing ? 'Loading projects' : 'Loading Tau Cloud projects'}
        slowLabel={isAwaitingListing ? 'Still loading projects' : 'Still loading Tau Cloud projects'}
        onRetry={
          isAwaitingListing
            ? () => {
                void retry();
              }
            : undefined
        }
      />
    </LibraryStatusSlot>
  );

  return (
    <PageContent className='flex flex-col gap-4 pb-4'>
      {/* Only the page that owns `/projects` titles the page and defers to the phone top bar; an embedded library is a section. */}
      {headingLevel === 1 ? (
        <PageHeader
          title='Projects'
          className='mb-0'
          action={
            /* Below `md` the phone bar carries the title and the action, and this row takes no height. */
            <div
              className={cn(
                'flex min-w-0 flex-1 basis-0 items-center justify-end gap-2',
                /* On a phone the row is read before it is seen, so its status region announces offline words as
                   they arrive; a notice shown gives it its height from then on. A wait is not seen there, so its
                   Retry is not in the focus order until the row is. */
                isHeaderInPhoneBar && !hasShownCloudNotice && 'max-md:sr-only max-md:[&_button]:hidden',
              )}
            >
              {statusSlot}
              <NewProjectLink isDeferredToPhoneBar />
            </div>
          }
        />
      ) : (
        <SectionHeader level={headingLevel} title='Projects' className='mb-0' action={statusSlot} />
      )}

      {workspaceBindingRepairs.length > 0 && (
        <div role='group' className='mb-6 space-y-2' aria-label='Workspace link repair'>
          {workspaceBindingRepairs.map((repair) => (
            <div
              key={repair.canonicalWorkspaceId}
              className='flex items-center gap-3 rounded-md border border-warning/40 p-3'
            >
              <AlertCircle className='size-4 shrink-0 text-warning' />
              <div className='min-w-0 flex-1'>
                <div className='font-medium'>
                  {repair.projectCount} {repair.projectCount === 1 ? 'project is' : 'projects are'} linked to previous
                  workspace identities.
                </div>
                <div className='text-sm text-muted-foreground'>Repair their links to “{repair.workspaceName}”.</div>
              </div>
              <Button
                size='sm'
                variant='outline'
                onClick={() => {
                  setRepairTarget(repair);
                }}
              >
                Repair links
              </Button>
            </div>
          ))}
        </div>
      )}

      {conflicts.length > 0 && (
        <div role='group' className='mb-6 space-y-2' aria-label='Project conflicts'>
          {conflicts.map((conflict) => {
            const key = `${conflict.locator.storageRootKey}:${conflict.locator.relativeDirectory}`;
            const label =
              conflict.status === 'invalid'
                ? (conflict.locator.relativeDirectory.split('/').at(-1) ?? conflict.locator.relativeDirectory)
                : conflict.manifest.name;
            return (
              <div key={key} className='flex items-center gap-3 rounded-md border border-warning/40 p-3'>
                <AlertCircle className='size-4 shrink-0 text-warning' />
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-medium'>{label}</div>
                  <div className='text-sm text-muted-foreground'>{conflictSummary(conflict)}</div>
                  {/* A missing manifest has nothing to add to its summary. */}
                  {(conflict.status === 'invalid' || conflict.status === 'adoption-required') &&
                  conflict.issue.code !== 'manifest-missing' ? (
                    <ManifestIssueLines issue={conflict.issue} />
                  ) : null}
                </div>
                {conflict.status === 'adoption-required' && (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={async () => handleAdopt(conflict.locator, conflict.manifest.name)}
                  >
                    Adopt
                  </Button>
                )}
                {conflict.status === 'duplicate-id' && (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={async () =>
                      handleChooseDirectory(conflict.locator, conflict.projectId, conflict.manifest.name)
                    }
                  >
                    Use this folder
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {degradedProjects.length > 0 && (
        <div role='group' className='mb-6 space-y-2' aria-label='Projects needing repair'>
          {degradedProjects.map((project) => (
            <div key={project.id} className='flex items-center gap-3 rounded-md border border-warning/40 p-3'>
              <AlertCircle className='size-4 shrink-0 text-warning' />
              <div className='min-w-0 flex-1'>
                <div className='truncate font-medium'>{project.name}</div>
                <div className='text-sm text-muted-foreground'>
                  {project.manifestIssue?.code === 'manifest-invalid-json'
                    ? 'tau.json has a syntax error. The project opens; fix tau.json in its editor.'
                    : 'tau.json has problems. The project opens, and Tau won’t change tau.json until it is repaired.'}
                </div>
                {project.manifestIssue ? <ManifestIssueLines issue={project.manifestIssue} /> : null}
              </div>
              {project.manifestIssue?.code === 'manifest-invalid-json' ? null : (
                <Button size='sm' variant='outline' onClick={async () => handleRepair(project)}>
                  Repair
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {recoveries.length > 0 && (
        <div role='group' className='mb-6 space-y-2' aria-label='Project recovery'>
          {recoveries.map((recovery) => (
            <div
              key={recovery.operationId}
              className={cn(
                'flex items-center gap-3 rounded-md border p-3',
                recovery.status === 'failed' && 'border-warning/40',
              )}
            >
              {recovery.status === 'failed' ? (
                <AlertCircle className='size-4 shrink-0 text-warning' />
              ) : (
                <Loader className='size-4 shrink-0 text-muted-foreground' />
              )}
              <div className='min-w-0 flex-1'>
                {/* The directory is the only handle the user has on an
                    unfinished operation — an unnamed banner is unactionable (DF11). */}
                <div className='truncate font-medium'>{recoveryDirectoryName(recovery)}</div>
                <div className='text-sm text-muted-foreground'>
                  {recovery.status === 'recovering'
                    ? 'Tau is finishing this project.'
                    : recovery.reason === 'workspace-unavailable'
                      ? 'Reconnect its workspace folder so Tau can finish recovery.'
                      : recovery.reason === 'identity-conflict'
                        ? 'The project directory belongs to different or unidentifiable content.'
                        : recovery.reason === 'local-state-error'
                          ? 'The project files committed, but local project state could not be restored.'
                          : 'Tau could not finish writing the project files.'}
                </div>
              </div>
              {recovery.status === 'failed' && (
                <Button size='sm' variant='outline' onClick={async () => handleDiscardRecovery(recovery.operationId)}>
                  Discard
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {listingError && projects.length > 0 ? (
        <div role='alert' className='flex items-center justify-between gap-3 rounded-md border p-3'>
          <span className='text-sm'>Projects could not be refreshed.</span>
          <Button size='sm' variant='outline' onClick={async () => retry()}>
            Retry
          </Button>
        </div>
      ) : null}

      {listingError && projects.length === 0 ? (
        <div
          role='alert'
          className='flex min-h-80 flex-col items-center justify-center gap-3 rounded-md border p-6 text-center'
        >
          <PackageX className='size-8 text-muted-foreground' />
          <div>
            <div className='font-medium'>Projects could not be loaded</div>
            <div className='text-sm text-muted-foreground'>Check the connected workspace and try again.</div>
          </div>
          <Button variant='outline' onClick={async () => retry()}>
            Retry
          </Button>
        </div>
      ) : (
        <UnifiedProjectList
          rows={rows}
          isCatalogUnavailable={isCatalogUnavailable}
          controls={viewControls}
          isShowingDeleted={showDeleted}
          onShowDeletedChange={handleToggleDeleted}
          isLoading={isLoading && projects.length === 0}
          rememberedCount={rememberedCount}
          rememberedProjects={rememberedProjects}
          viewMode={viewMode}
          actions={actions}
          onOpenCloudProject={handleOpenCloudProject}
          emptyTitleLevel={headingLevel === 1 ? 2 : 3}
        />
      )}
      <AlertDialog
        open={repairTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setRepairTarget(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repair project links to “{repairTarget?.workspaceName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Tau updates browser routing metadata only. It will not move or modify folder contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmWorkspaceBindingRepair}>
              Repair {repairTarget?.projectCount} {repairTarget?.projectCount === 1 ? 'project' : 'projects'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={permanentDeleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPermanentDeleteTarget(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the exact project directory and its local chats and editor state. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                void confirmPermanentDelete();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContent>
  );
}

type UnifiedProjectListProps = {
  readonly isCatalogUnavailable: boolean;
  readonly controls: ReactNode;
  /** Whether the list is the Trash; its toggle lives in the sort menu (R15). */
  readonly isShowingDeleted: boolean;
  readonly onShowDeletedChange: (isShowing: boolean) => void;
  readonly isLoading: boolean;
  /** The last listing's count (R5): how many cards to reserve while loading, `0` for the empty state. */
  readonly rememberedCount?: number;
  /** The projects the listing snapshot remembered (A15g): the cards drawn while loading, by name. */
  readonly rememberedProjects?: readonly RememberedProject[];
  readonly rows: LibraryRow[];
  readonly viewMode: 'grid' | 'table';
  readonly actions: ProjectActions;
  readonly onOpenCloudProject: (entry: CloudProject) => Promise<void>;
  /** The no-match state's heading level: one below the library's own heading. */
  readonly emptyTitleLevel: 2 | 3;
};

// Page size options, shared by both view modes so the remembered choice survives a view switch.
const queryParameter = stringParameter();
const sortParameter = enumParameter(
  z.enum([
    'lastActivityAt:desc',
    'lastActivityAt:asc',
    'name:desc',
    'name:asc',
    'description:desc',
    'description:asc',
    'none',
  ]),
  'lastActivityAt:desc',
);

const defaultPageSize = 20;
const minimumPageSize = defaultPageSize;
const pageSizeOptions = [minimumPageSize, 50, 100, 150, 200];

/**
 * What the list draws before and after its rows arrive (R5, R12, R14).
 *
 * @param input - The list's row counts, loading state, remembered count and page size.
 * @returns Whether the list is empty, still awaiting rows, how many cards to reserve, and whether it pages.
 */
function projectListLayout({
  rowCount,
  filteredRowCount,
  isLoading,
  rememberedCount,
  pageSize,
}: {
  readonly rowCount: number;
  readonly filteredRowCount: number;
  readonly isLoading: boolean;
  readonly rememberedCount: number | undefined;
  readonly pageSize: number;
}): { isEmpty: boolean; isAwaitingRows: boolean; placeholderCount: number; isPaged: boolean } {
  const isEmpty = rowCount === 0 && (!isLoading || rememberedCount === 0);
  const isAwaitingRows = isLoading && !isEmpty;
  /* R14: paging is offered only when the list is longer than the smallest page, and is
     reserved with the grid from the remembered count rather than appearing after it. */
  const pagedCount = isAwaitingRows ? (rememberedCount ?? 0) : filteredRowCount;
  return {
    isEmpty,
    isAwaitingRows,
    placeholderCount: Math.min(rememberedCount ?? defaultPageSize, pageSize),
    isPaged: pagedCount > minimumPageSize,
  };
}

/** The columns a remembered card is sorted and searched by, as the list's own columns define them. */
const rememberedColumns: Array<ColumnDef<RememberedProject & { readonly description?: string }>> = [
  { accessorKey: 'name', enableSorting: true },
  { accessorKey: 'description' },
  { accessorKey: 'lastActivityAt', sortingFn: 'datetime' },
];

/**
 * The remembered cards a loading grid draws (P-g): the snapshot's projects through a table with the list's own sort,
 * search and page size, so an accurate snapshot moves nothing when the listing answers. The snapshot holds no
 * description, so a search or sort on it alone is settled by the listing.
 *
 * @param input - The remembered projects, the list's sorting and search, and its page size.
 * @returns The first page of remembered cards.
 */
function useRememberedCards({
  projects,
  sorting,
  globalFilter,
  pageSize,
}: {
  readonly projects: readonly RememberedProject[] | undefined;
  readonly sorting: SortingState;
  readonly globalFilter: string | undefined;
  readonly pageSize: number;
}): RememberedProject[] | undefined {
  'use no memo';

  const data = useMemo(() => [...(projects ?? [])], [projects]);
  // oxlint-disable-next-line react/incompatible-library -- Opted out of the compiler, as the list's own table is.
  const table = useReactTable({
    data,
    columns: rememberedColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, globalFilter, pagination: { pageIndex: 0, pageSize } },
  });
  return projects === undefined ? undefined : table.getRowModel().rows.map((row) => row.original);
}

/**
 * The room one card takes while nothing about it is known (P-g, the server render and the hydration frame): a card's
 * box at its real height, drawn invisible, so the grid region has the height the count gives and no card shape is
 * painted. The remembered or listed card that follows arrives into the room without moving anything.
 *
 * @returns The invisible room, hidden from assistive technology.
 */
function ProjectCardRoom(): React.JSX.Element {
  return (
    <Card aria-hidden className='invisible relative flex h-full flex-col overflow-hidden pt-0'>
      <div className='relative aspect-4/3 h-fit w-full bg-muted' />
      <CardHeader>
        <div className='flex flex-col py-1'>
          <div className='h-7' />
          <div className='h-4' />
        </div>
      </CardHeader>
      <CardFooter className='mt-auto'>
        <div className='h-8' />
      </CardFooter>
    </Card>
  );
}

/** What the Projects header's slot says about Tau Cloud in words, instead of a wait (P-k). */
type CloudNotice = 'offline' | 'failed';

/**
 * Offline while the listing has not answered (it is held until the browser is back online), or failed.
 *
 * @param state - The browser's connection and the listing's state.
 * @returns The notice, or `undefined` when the slot shows the wait or nothing.
 */
function cloudNoticeOf({
  isOnline,
  isCloudSettled,
  cloud,
}: {
  readonly isOnline: boolean;
  readonly isCloudSettled: boolean;
  readonly cloud: CloudListingState;
}): CloudNotice | undefined {
  if (!isOnline && !isCloudSettled) {
    return 'offline';
  }
  return cloud === 'failed' ? 'failed' : undefined;
}

/** One Tau Cloud wait as the slot times it: from its start, announced when a Retry press began it. */
type CloudWait = Readonly<{
  startedAt: number;
  isAnnounced: boolean;
  /** The press that began it, if any. A later press restarts the wait. */
  retriedAt?: number;
  /** Whether it followed a failure, whose Retry it keeps in view. */
  followsFailure: boolean;
}>;

/**
 * When the slot times a Tau Cloud wait from: its start, or, for a first wait that took over a shown local listing wait
 * (shown from 1,000 ms), early enough that it counts as already shown, so the slot does not blink empty at the hand-over.
 *
 * @param state - The Tau Cloud wait and when the local listing's wait handed the slot over, if it did.
 * @returns The start on the wait clock's timeline, or 0 when no wait runs. Milliseconds.
 */
function shownFromOf({
  wait,
  listingHandoverAt,
}: {
  readonly wait: CloudWait | undefined;
  readonly listingHandoverAt: number | undefined;
}): number {
  if (wait === undefined) {
    return 0;
  }
  if (wait.isAnnounced || listingHandoverAt === undefined || listingHandoverAt < indicatorDelayMilliseconds) {
    return wait.startedAt;
  }
  return Math.min(wait.startedAt, listingHandoverAt - indicatorDelayMilliseconds);
}

/** Tau Cloud's Retry in the slot: shown, or, for the first wait, revealed at its slow mark (`slowDelay`). */
type CloudRetry = Readonly<{ slowDelay?: string }>;

/**
 * Tau Cloud's one Retry: beside a failure, through the wait a Retry starts or that follows a failure, and from the
 * slow mark of a first wait the person did not start. None beside the offline words, which a Retry cannot help.
 *
 * @param state - The slot's notice, the Tau Cloud wait and its timing.
 * @returns How Retry is offered, or `undefined` for none.
 */
function cloudRetryOf({
  notice,
  wait,
  timing,
}: {
  readonly notice: CloudNotice | undefined;
  readonly wait: CloudWait | undefined;
  readonly timing: WaitIndicatorTiming;
}): CloudRetry | undefined {
  if (notice === 'offline') {
    return undefined;
  }
  if (notice === 'failed' || wait?.isAnnounced === true || wait?.followsFailure === true) {
    return {};
  }
  if (wait !== undefined && timing.state === 'waiting') {
    return { slowDelay: timing.slowDelay };
  }
  return undefined;
}

/**
 * The reveal delay a Retry beside the slow words shares with them.
 *
 * @param slowDelay - The wait's slow mark, as the indicator's `--wait-slow-delay`.
 * @returns The Retry's style.
 */
function retryRevealStyle(slowDelay: string): React.CSSProperties & Record<'--wait-slow-delay', string> {
  return { '--wait-slow-delay': slowDelay };
}

/**
 * The Projects header's trailing status slot (P-k): one line, as tall as the wait indicator, that takes the row's
 * spare width and clips there, so it never wraps the header. It says Tau Cloud is offline or failed, with Retry for
 * the failure, and otherwise holds the wait indicator it is given.
 */
function LibraryStatusSlot({
  notice,
  announcement,
  retry,
  onRetryCloud,
  children,
}: {
  readonly notice: CloudNotice | undefined;
  /** Words the status region announces without showing, for a wait a Retry started. */
  readonly announcement: string | undefined;
  /** How Tau Cloud's Retry is offered, if at all. */
  readonly retry: CloudRetry | undefined;
  readonly onRetryCloud: () => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot='project-library-status'
      className='flex min-h-6 min-w-0 flex-1 basis-0 items-center justify-end gap-1.5 overflow-hidden text-xs text-muted-foreground'
    >
      {/* One status region, always present, so the offline words and a Retry's wait are announced when they arrive. */}
      {/* Never `display: none`, even empty: a live region must be in the tree before its words arrive. Out of the
          flow while it shows nothing, it adds no gap. */}
      <span role='status' className={cn('min-w-0 truncate', notice !== 'offline' && 'sr-only')}>
        {notice === 'offline' ? 'Offline. Showing projects on this device.' : announcement}
      </span>
      {notice === 'offline' ? null : notice === 'failed' ? (
        <span role='alert' className='flex min-w-0 items-center gap-1.5'>
          <AlertCircle aria-hidden className='size-3.5 shrink-0 text-warning' />
          <span className='truncate'>Tau Cloud projects not loaded</span>
        </span>
      ) : (
        children
      )}
      {/* Last in the slot, so the same element stays while the words before it change. */}
      {retry === undefined ? null : (
        <Button
          type='button'
          variant='ghost'
          size='xs'
          className={cn('min-w-6 shrink-0', retry.slowDelay !== undefined && 'wait-after-slow')}
          style={retry.slowDelay === undefined ? undefined : retryRevealStyle(retry.slowDelay)}
          aria-label='Retry Tau Cloud'
          onClick={onRetryCloud}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

function UnifiedProjectList({
  rows,
  viewMode,
  actions,
  onOpenCloudProject,
  isCatalogUnavailable,
  controls,
  isShowingDeleted,
  onShowDeletedChange,
  isLoading,
  rememberedCount,
  rememberedProjects,
  emptyTitleLevel,
}: UnifiedProjectListProps) {
  'use no memo';

  const [sort, setSort] = useSearchParameter(searchParameterName.sort, sortParameter);
  const sorting = useMemo<SortingState>(() => {
    const [id, direction] = sort.split(':');
    return sort === 'none' ? [] : [{ id: id!, desc: direction === 'desc' }];
  }, [sort]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useSearchParameter(searchParameterName.query, queryParameter);
  const [pageSize, setPageSize] = useCookie<number>(cookieName.projectPageSize, defaultPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  // TanStack flexRender treats cell functions as component types; recreating them unmounts open row dialogs.
  const columns = useMemo(() => createColumns(actions, onOpenCloudProject), [actions, onOpenCloudProject]);

  // oxlint-disable-next-line react/incompatible-library -- This component is explicitly opted out because TanStack Table returns mutable functions that cannot be compiler-memoized safely.
  const table = useReactTable({
    data: rows,
    columns,
    /* Stable across the cloud listing arriving, so a selection follows its project. */
    getRowId: (row) => row.id,
    /* A project this device does not hold has nothing here to trash (D20). */
    enableRowSelection: (row) => !isCloudOnly(row.original),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: (updater) => {
      const next = isFunction(updater) ? updater(sorting) : updater;
      const first = next[0];
      setSort(sortParameter.parse(first ? `${first.id}:${first.desc ? 'desc' : 'asc'}` : 'none'));
    },
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: (updater) => {
      const next = isFunction(updater) ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: { pageIndex, pageSize },
    },
  });

  /* R12: an empty library keeps its controls row where the list's controls sit, and says
     so in one line; the hero above is the way to start. R5: a remembered empty list is
     known before the worker lists, so the server renders this state up front. */
  const { isEmpty, isAwaitingRows, placeholderCount, isPaged } = projectListLayout({
    rowCount: rows.length,
    filteredRowCount: table.getFilteredRowModel().rows.length,
    isLoading,
    rememberedCount,
    pageSize,
  });
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const rememberedCards = useRememberedCards({ projects: rememberedProjects, sorting, globalFilter, pageSize });

  return (
    <div className='space-y-4'>
      <div role='group' aria-label='Project controls' className='flex flex-wrap items-center justify-between gap-2'>
        <DataTableSearch
          table={table}
          placeholder='Search projects…'
          containerClassName='min-w-40 grow basis-40'
          isDisabled={isEmpty}
        />
        <div className='flex flex-wrap items-center gap-2'>
          {selectedCount > 0 && <BulkActions table={table} deleteProject={actions.handleDelete} />}
          <DataTableSortingDropdown table={table}>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={isShowingDeleted} onCheckedChange={onShowDeletedChange}>
              Show trashed projects
            </DropdownMenuCheckboxItem>
          </DataTableSortingDropdown>
          {controls}
          {viewMode === 'table' ? <DataTableColumnVisibilityDropdown table={table} /> : null}
        </div>
      </div>

      {isEmpty ? (
        isCatalogUnavailable ? null : (
          <p className='text-sm text-muted-foreground'>
            {isShowingDeleted ? 'Trash is empty.' : 'No projects yet. Your first project appears here.'}
          </p>
        )
      ) : isAwaitingRows && viewMode === 'table' ? (
        <div role='status' aria-label='Loading projects' aria-busy='true'>
          <DataTable table={table} columns={columns} isLoading />
        </div>
      ) : !isAwaitingRows && table.getFilteredRowModel().rows.length === 0 ? (
        <PanelEmptyState
          className='h-60'
          icon={PackageX}
          titleLevel={emptyTitleLevel}
          title={isCatalogUnavailable ? 'No matches on this device' : 'No matching projects'}
          description={isCatalogUnavailable ? 'Tau Cloud projects are not all available yet.' : undefined}
        >
          <Button
            variant='outline'
            onClick={() => {
              setGlobalFilter('');
            }}
          >
            Clear filters
          </Button>
        </PanelEmptyState>
      ) : viewMode === 'table' ? (
        // Table View
        <DataTable table={table} columns={columns} />
      ) : isAwaitingRows ? (
        /* P-g: the remembered cards are the same list and cards the listing then fills, reconciled by id in place;
           with only a count, the grid holds the room for that many cards and draws none. */
        <ul aria-label='Projects' aria-busy='true' className={projectGridClassName}>
          {/* One flat list, as the listed grid's, so its items are the ones the listing keeps. The snapshot keeps at
              most 100 projects; an unfiltered page longer than that keeps the count's height with room. */}
          {[
            ...(rememberedCards ?? []).map((project) => (
              <li key={project.id}>
                <ProjectLibraryCard project={project} actions={actions} />
              </li>
            )),
            ...Array.from(
              {
                length:
                  rememberedCards === undefined
                    ? placeholderCount
                    : globalFilter
                      ? 0
                      : Math.max(placeholderCount - rememberedCards.length, 0),
              },
              (_, index) => (
                <li key={`room-${String(index)}`} aria-hidden>
                  <ProjectCardRoom />
                </li>
              ),
            ),
          ]}
        </ul>
      ) : (
        // Grid View
        <ul aria-label='Projects' className={projectGridClassName}>
          {table.getRowModel().rows.map((row) => {
            const { original } = row;
            return (
              <li key={original.id}>
                {isCloudOnly(original) ? (
                  <CloudProjectCard entry={original} onOpen={onOpenCloudProject} />
                ) : (
                  <ProjectLibraryCard
                    project={original}
                    actions={actions}
                    isSelected={row.getIsSelected()}
                    isSelecting={selectedCount > 0}
                    onSelect={() => {
                      row.toggleSelected();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isPaged ? (
        isAwaitingRows ? (
          <div aria-hidden data-testid='project-pagination-placeholder' className='h-8' />
        ) : (
          <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} itemName='project' />
        )
      ) : null}
    </div>
  );
}

/** A listed project's card, or one the listing snapshot remembered before the listing answered (A15g). */
type ListedCardProject = ProjectListItem & { readonly onCloud?: boolean; readonly cloud?: CloudProject };

type ProjectLibraryCardProps = {
  readonly project: ListedCardProject | RememberedProject;
  readonly actions: ProjectActions;
  readonly isSelected?: boolean;
  /** Whether any card is selected, so every card shows its checkbox (R13). */
  readonly isSelecting?: boolean;
  readonly onSelect?: () => void;
};

/**
 * Where a card's project lives, as its location row draws it: the place's icon and full label, and the slugs. A
 * remembered card takes the place the snapshot kept; one kept before places were remembered names its slugs only.
 *
 * @param project - The listed or remembered project.
 * @returns The location row's icon, when the place is known, its label and its slug path.
 */
function cardLocation(project: ListedCardProject | RememberedProject): {
  readonly LocationIcon: LucideIcon | undefined;
  readonly label: string;
  readonly slugPath: string;
} {
  const listed = 'locator' in project ? project : undefined;
  const slugPath = project.slugs
    ? `${project.slugs.workspaceSlug}/${project.slugs.projectSlug}`
    : listed
      ? projectSlugOf(listed.locator)
      : '';
  const place: RememberedPlace | undefined =
    'locator' in project
      ? project.locator.backend === 'webaccess'
        ? { kind: 'workspace', workspaceName: project.workspaceName }
        : { kind: 'home' }
      : project.place;
  if (place === undefined) {
    return { LocationIcon: undefined, label: slugPath, slugPath };
  }
  return {
    LocationIcon: place.kind === 'workspace' ? FolderOpen : House,
    label: projectLocationFullLabel(projectLocationDescriptor(place)),
    slugPath,
  };
}

export function ProjectLibraryCard({
  project,
  actions,
  isSelected = false,
  isSelecting = false,
  onSelect,
}: ProjectLibraryCardProps): React.JSX.Element {
  const navigation = useNavigation();
  const projectUrl = projectUrlOr(project.slugs);
  const isOpening = navigation.location?.pathname === projectUrl;
  const nameEditor = useRef<InlineTextEditorHandle>(null);
  const [showPreview, setShowPreview] = useState(false);
  const thumbnail = useProjectThumbnail(project.id);
  const thumbnailSource = thumbnail.url;
  /* A15g: a remembered card is the same card before the listing confirms it. It names, places and links its project;
     its controls keep their resting look but take no input (`inert`) until the listing answers. */
  const listed = 'locator' in project ? project : undefined;
  const mainFile = listed?.assets.main?.entryPath;
  const { LocationIcon, label: locationLabel, slugPath } = cardLocation(project);
  const isInert = listed === undefined;

  return (
    <ProjectCard
      {...(listed?.cloud?.cloudState === 'deleting'
        ? { onOpen: () => undefined, isOpening: true }
        : { to: projectUrl, isOpening })}
      linkLabel={`${isOpening ? 'Opening…' : 'Open'} ${project.name}`}
      className={cn('flex flex-col', isSelected && 'ring-3 ring-primary')}
    >
      {/* R13: selection is a mode, not resting chrome: the checkbox shows when the card is
          reached (hover or focus), on coarse pointers, and on every card once one is selected. */}
      <div
        inert={isInert}
        className={cn(
          'absolute top-2 left-2 z-20',
          !isSelecting &&
            !isSelected &&
            'opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 pointer-coarse:opacity-100',
        )}
      >
        <Checkbox
          size='large'
          aria-label={`Select ${project.name}`}
          checked={isSelected}
          onCheckedChange={() => onSelect?.()}
        />
      </div>
      {thumbnail.status === 'error' || thumbnail.status === 'closed' ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='relative z-20'
          title={thumbnail.error}
          onClick={() => {
            thumbnail.refresh();
          }}
        >
          Retry thumbnail
        </Button>
      ) : null}
      <ProjectCardMedia
        thumbnailSource={thumbnailSource}
        isThumbnailPending={thumbnail.status === 'registering' || thumbnail.status === 'pending'}
        isPreviewInert={isInert}
        isPreviewVisible={showPreview}
        onPreviewVisibilityChange={setShowPreview}
      >
        {showPreview && mainFile !== undefined ? (
          <SharedWorkerGate>
            <HomeFileManagerProvider key={project.id} projectId={project.id} rootDirectory={`/projects/${project.id}`}>
              <CadPreviewProvider
                projectId={project.id}
                mainFile={mainFile}
                initialVerticalFieldOfView={projectCardVerticalFieldOfView}
              >
                <ProjectCardCadPreview />
              </CadPreviewProvider>
            </HomeFileManagerProvider>
          </SharedWorkerGate>
        ) : null}
      </ProjectCardMedia>
      <CardHeader>
        <div className='relative z-20 -mx-2 flex flex-1 flex-col items-start justify-start overflow-hidden py-1'>
          <div inert={isInert} className='contents'>
            <InlineTextEditor
              ref={nameEditor}
              ariaLabel='Project name'
              value={project.name}
              className='h-7 w-full [&_[data-slot=button]]:w-full [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:text-base [&_[data-slot=button]]:font-semibold'
              onSave={async (value) => actions.handleRename(project.id, value)}
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className='flex min-h-4 w-fit max-w-full items-center gap-1.5 px-2 text-xs text-muted-foreground'
                role='group'
                aria-label={`Location: ${locationLabel}`}
              >
                {LocationIcon === undefined ? null : <LocationIcon className='size-3 shrink-0' />}
                <span className='truncate'>{slugPath}</span>
                {listed?.cloud?.cloudState === 'deleting' ? (
                  <span role='status'>Deleting from Tau Cloud…</span>
                ) : listed?.onCloud === true ? (
                  <OnTauCloudMark />
                ) : undefined}
              </div>
            </TooltipTrigger>
            <TooltipContent side='right'>{locationLabel}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardFooter className='mt-auto flex items-center justify-between'>
        <Button asChild variant='outline'>
          <span aria-hidden='true' className='pointer-events-none'>
            {isOpening ? 'Opening…' : 'Open'}
            {isOpening ? <Loader /> : <ArrowRight />}
          </span>
        </Button>

        <div inert={isInert} className='relative z-20'>
          {listed ? (
            <ProjectActionDropdown
              project={listed}
              actions={actions}
              onRename={() => nameEditor.current?.startEditing()}
            />
          ) : (
            <ProjectActionMenu name={project.name} />
          )}
        </div>
      </CardFooter>
    </ProjectCard>
  );
}

type BulkActionsProps = {
  readonly table: ReturnType<typeof useReactTable<LibraryRow>>;
  readonly deleteProject: ProjectActions['handleDelete'];
};

function BulkActions({ table, deleteProject }: BulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get selected row data
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  const handleBulkDelete = async (): Promise<void> => {
    setIsDeleting(true);
    /* Never selectable (D20): a Tau-Cloud-only row has nothing here to trash. */
    const projects = selectedRows
      .map((row) => row.original)
      .filter((project): project is ProjectListItem => !isCloudOnly(project));
    const results = await Promise.all(
      projects.map(async (project) => {
        try {
          return await deleteProject(project, { announce: false });
        } catch (error) {
          console.error('Error deleting project:', error);
          return false;
        }
      }),
    );
    const successCount = results.filter(Boolean).length;
    const errorCount = results.length - successCount;

    setIsDeleting(false);
    setShowDeleteDialog(false);
    table.resetRowSelection();

    if (successCount > 0 && errorCount === 0) {
      toast.success(`Moved ${successCount} project${successCount === 1 ? '' : 's'} to Trash`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`Moved ${successCount} project${successCount === 1 ? '' : 's'} to Trash; ${errorCount} failed`);
    } else {
      toast.error('Could not move selected projects to Trash');
    }
  };

  return (
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <div className='flex items-center gap-2'>
        <AlertDialogTrigger asChild>
          <Button variant='destructive' size='sm' disabled={isDeleting}>
            <Trash className='h-4 w-4' />
            Move to Trash
            <span className='ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs'>{selectedCount}</span>
          </Button>
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2'>
            <AlertCircle className='h-5 w-5 text-destructive' />
            Move {selectedCount} project{selectedCount === 1 ? '' : 's'} to Trash?
          </AlertDialogTitle>
          <AlertDialogDescription className='space-y-2'>
            <p>The following projects will be moved to the trash:</p>
            <p>Any running agents will be stopped first. Their work so far is saved in history.</p>
            <ul className='max-h-40 list-disc overflow-y-auto pl-6 text-sm'>
              {selectedRows.map((row) => {
                const project = row.original;
                return (
                  <li key={row.id}>
                    {project.name}{' '}
                    <span className='text-muted-foreground/70 italic'>
                      (modified {formatRelativeTime(project.lastActivityAt)})
                    </span>
                  </li>
                );
              })}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={isDeleting}
            onClick={() => {
              void handleBulkDelete();
            }}
          >
            Move to Trash
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
