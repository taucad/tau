import { useState, useCallback } from 'react';
import {
  Grid,
  ArrowRight,
  Table as TableIcon,
  Cog,
  Trash,
  AlertCircle,
  PackageX,
  FolderOpen,
  House,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { VisibilityState, SortingState } from '@tanstack/react-table';
import type { ProjectLocator } from '@taucad/filesystem';
import { describeProjectManifestIssue } from '@taucad/types';
import type { ProjectManifestParseIssue } from '@taucad/types';
import type { ProjectListItem } from '#types/project-library.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import { createColumns } from '#components/project-library/columns.js';
import { Button, buttonVariants } from '@taucad/ui/components/button';
import { CardHeader, CardFooter } from '@taucad/ui/components/card';
import {
  DataTable,
  DataTableSearch,
  DataTablePagination,
  DataTableSortingDropdown,
  DataTableColumnVisibilityDropdown,
} from '#components/ui/data-table.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';
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
import { isFunction } from '#utils/function.utils.js';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Loader } from '#components/ui/loader.js';
import { cookieName } from '#constants/cookie.constants.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { flagParameter } from '#utils/search-parameter.codecs.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { CollectionEmptyState } from '#components/ui/collection-empty-state.js';
import { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { ChatComposerProvider } from '#hooks/active-chat-provider.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { Skeleton } from '@taucad/ui/components/skeleton';
import type { ProjectDiscoveryConflict, WorkspaceBindingRepairGroup } from '#hooks/use-project-manager.js';
import { ProjectCard, ProjectCardCadPreview, ProjectCardMedia } from '#components/project-card.js';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { projectSlugOf, projectUrlOr } from '#utils/project-url.utils.js';
import { projectLocationDescriptor, projectLocationFullLabel } from '#utils/project-creation-location.utils.js';
import { useCloudProjects } from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { useOpenCloudProject } from '#hooks/use-open-cloud-project.js';
import {
  CloudProjectCard,
  OnTauCloudMark,
  isCloudOnly,
  toLibraryRows,
  useMaterializeCloudProjects,
} from '#routes/projects_/cloud-projects.js';
import type { LibraryRow } from '#routes/projects_/cloud-projects.js';

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
        : 'This project needs a Tau identity before it can be opened.';
    }
    case 'duplicate-id': {
      return 'This copied project shares an identity with another directory. Choose which folder Tau opens.';
    }
    case 'route-blocked': {
      return 'This project’s workspace is not connected. Reconnect the folder to open it.';
    }
    case 'invalid': {
      switch (conflict.issue.code) {
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
function ManifestIssueLines({ issue }: { readonly issue: ProjectManifestParseIssue }): React.JSX.Element {
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
export function ProjectLibrary(): React.JSX.Element {
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
  const degradedProjects = projects.filter(
    (project) => project.manifestIssue !== undefined && project.deletedAt === undefined,
  );
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const { projects: cloudProjects, isSettled: isCloudSettled, isFetching: isCloudFetching } = useCloudProjects();
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

  const actions: ProjectActions = {
    handleDelete,
    handlePermanentlyDelete,
    handleDuplicate,
    handleRename,
    handleRestore,
  };

  return (
    <PageContent>
      <PageHeader
        title='Projects'
        className='mb-6'
        action={
          <Button asChild>
            <NavLink to='/projects/new'>
              {({ isPending }) => (
                <>
                  New project
                  {isPending ? <Loader /> : null}
                </>
              )}
            </NavLink>
          </Button>
        }
      />

      {workspaceBindingRepairs.length > 0 && (
        <div className='mb-6 space-y-2' aria-label='Workspace link repair'>
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
        <div className='mb-6 space-y-2' aria-label='Project conflicts'>
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
                      handleChooseDirectory(conflict.locator, conflict.manifest.id, conflict.manifest.name)
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
        <div className='mb-6 space-y-2' aria-label='Projects needing repair'>
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
        <div className='mb-6 space-y-2' aria-label='Project recovery'>
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
        <div className='mb-6 flex items-center justify-between gap-3 rounded-md border border-feature/40 p-3'>
          <span className='text-sm'>Projects could not be refreshed.</span>
          <Button size='sm' variant='outline' onClick={async () => retry()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className='mb-4 flex justify-end gap-2'>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon' aria-label='Settings'>
              <Cog className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showDeleted} onCheckedChange={handleToggleDeleted}>
              Show trashed projects
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {listingError && projects.length === 0 ? (
        <div className='flex min-h-80 flex-col items-center justify-center gap-3 rounded-md border p-6 text-center'>
          <PackageX className='size-8 text-muted-foreground' />
          <div>
            <div className='font-medium'>Projects could not be loaded</div>
            <div className='text-sm text-muted-foreground'>Check the connected workspace and try again.</div>
          </div>
          <Button variant='outline' onClick={async () => retry()}>
            Retry
          </Button>
        </div>
      ) : isLoading && projects.length === 0 ? (
        <div
          className='grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4'
          role='status'
          aria-label='Loading projects'
          aria-busy='true'
        >
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className='aspect-4/3 w-full rounded-md' />
          ))}
        </div>
      ) : (
        <UnifiedProjectList
          rows={toLibraryRows({ projects, held: heldProjects, cloud: cloudProjects, includeCloudOnly: !showDeleted })}
          viewMode={viewMode}
          actions={actions}
          onOpenCloudProject={handleOpenCloudProject}
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
  readonly rows: LibraryRow[];
  readonly viewMode: 'grid' | 'table';
  readonly actions: ProjectActions;
  readonly onOpenCloudProject: (entry: CloudProject) => Promise<void>;
};

// Page size options, shared by both view modes so the remembered choice survives a view switch.
const defaultPageSize = 20;
const pageSizeOptions = [defaultPageSize, 50, 100, 150, 200];

function UnifiedProjectList({ rows, viewMode, actions, onOpenCloudProject }: UnifiedProjectListProps) {
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastActivityAt', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [pageSize, setPageSize] = useCookie<number>(cookieName.projectPageSize, defaultPageSize);
  const [pageIndex, setPageIndex] = useState(0);

  // oxlint-disable-next-line react/incompatible-library -- This component is explicitly opted out because TanStack Table returns mutable functions that cannot be compiler-memoized safely.
  const table = useReactTable({
    data: rows,
    columns: createColumns(actions, onOpenCloudProject),
    /* Stable across the cloud listing arriving, so a selection follows its project. */
    getRowId: (row) => row.id,
    /* A project this device does not hold has nothing here to trash (D20). */
    enableRowSelection: (row) => !isCloudOnly(row.original),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
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

  // Show empty state if no projects at all
  if (rows.length === 0) {
    return (
      <CollectionEmptyState className='min-h-[60vh]'>
        {/* Empty-library CTA — composer-only, no chat session to attach to. */}
        <ChatComposerProvider surface='library'>
          <div className='mx-auto w-full max-w-2xl space-y-6'>
            <div className='flex flex-col items-center space-y-4 text-center'>
              <PackageX className='size-16 text-muted-foreground' strokeWidth={1} />
              <div className='space-y-2'>
                <h2 className='text-xl font-semibold'>No projects yet</h2>
                <p className='text-sm'>Start by describing what you want to build, or create from code</p>
              </div>
            </div>
            <NewProjectChatComposer enableAutoFocus={false} className='shadow-none' />
            <div className='flex items-center justify-center gap-4 text-sm text-muted-foreground'>
              <div className='h-px flex-1 bg-border' />
              <span>or</span>
              <div className='h-px flex-1 bg-border' />
            </div>
            <div className='flex justify-center'>
              <NavLink to='/projects/new' tabIndex={-1}>
                {({ isPending }) => (
                  <InteractiveHoverButton className='flex items-center gap-2 font-light [&_svg]:size-4 [&_svg]:stroke-1'>
                    {isPending ? <Loader /> : 'Build from code'}
                  </InteractiveHoverButton>
                )}
              </NavLink>
            </div>
          </div>
        </ChatComposerProvider>
      </CollectionEmptyState>
    );
  }

  const columns = createColumns(actions, onOpenCloudProject);
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <DataTableSearch table={table} placeholder='Search projects…' containerClassName='grow' />
        <div className='flex items-center gap-2'>
          {/* Add bulk actions when rows are selected */}
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <BulkActions table={table} deleteProject={actions.handleDelete} />
          )}
          <DataTableSortingDropdown table={table} />
          <DataTableColumnVisibilityDropdown table={table} />
        </div>
      </div>

      {viewMode === 'table' ? (
        // Table View
        <DataTable table={table} columns={columns} />
      ) : (
        // Grid View
        <div className='grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
          {table.getRowModel().rows.map((row) => {
            const { original } = row;
            return isCloudOnly(original) ? (
              <CloudProjectCard key={original.id} entry={original} onOpen={onOpenCloudProject} />
            ) : (
              <ProjectLibraryCard
                key={original.id}
                project={original}
                actions={actions}
                isSelected={row.getIsSelected()}
                onSelect={() => {
                  row.toggleSelected();
                }}
              />
            );
          })}
        </div>
      )}

      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} itemName='project' />
    </div>
  );
}

type ProjectLibraryCardProps = {
  readonly project: ProjectListItem & { readonly onCloud?: boolean };
  readonly actions: ProjectActions;
  readonly isSelected?: boolean;
  readonly onSelect?: () => void;
};

export function ProjectLibraryCard({
  project,
  actions,
  isSelected,
  onSelect,
}: ProjectLibraryCardProps): React.JSX.Element {
  const [showPreview, setShowPreview] = useState(false);
  const thumbnailSource = useProjectThumbnail(project.id);

  const mainFile = project.assets.main.entryPath;
  const location = projectLocationDescriptor(
    project.locator.backend === 'webaccess'
      ? { kind: 'workspace', workspaceName: project.workspaceName }
      : { kind: 'home' },
  );
  const LocationIcon = project.locator.backend === 'webaccess' ? FolderOpen : House;
  const fullLocationLabel = projectLocationFullLabel(location);
  const slugPath = project.slugs
    ? `${project.slugs.workspaceSlug}/${project.slugs.projectSlug}`
    : project.locator.relativeDirectory === ''
      ? 'Selected folder'
      : projectSlugOf(project.locator);

  return (
    <ProjectCard
      to={projectUrlOr(project.slugs)}
      linkLabel={`Open ${project.name}`}
      className={cn('flex flex-col', isSelected && 'ring-3 ring-primary')}
    >
      <div className='absolute top-2 left-2 z-20'>
        <Checkbox
          size='large'
          aria-label={`Select ${project.name}`}
          checked={isSelected}
          onCheckedChange={() => onSelect?.()}
        />
      </div>
      <ProjectCardMedia
        thumbnailSource={thumbnailSource}
        isPreviewVisible={showPreview}
        onPreviewVisibilityChange={setShowPreview}
      >
        {showPreview ? (
          <SharedWorkerGate>
            <HomeFileManagerProvider key={project.id} projectId={project.id} rootDirectory={`/projects/${project.id}`}>
              <CadPreviewProvider projectId={project.id} mainFile={mainFile}>
                <ProjectCardCadPreview />
              </CadPreviewProvider>
            </HomeFileManagerProvider>
          </SharedWorkerGate>
        ) : null}
      </ProjectCardMedia>
      <CardHeader>
        <div className='relative z-20 -mx-2 flex flex-1 flex-col items-start justify-start overflow-hidden py-1'>
          <InlineTextEditor
            value={project.name}
            className='h-7 w-full [&_[data-slot=button]]:w-full [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:text-base [&_[data-slot=button]]:font-semibold'
            onSave={async (value) => actions.handleRename(project.id, value)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className='flex w-fit max-w-full items-center gap-1.5 px-2 text-xs text-muted-foreground'
                aria-label={`Location: ${fullLocationLabel}`}
              >
                <LocationIcon className='size-3 shrink-0' />
                <span className='truncate'>{slugPath}</span>
                {project.onCloud === true ? <OnTauCloudMark /> : undefined}
              </div>
            </TooltipTrigger>
            <TooltipContent side='right'>{fullLocationLabel}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardFooter className='mt-auto flex items-center justify-between'>
        <Button asChild variant='outline'>
          <span aria-hidden='true' className='pointer-events-none'>
            <ArrowRight className='size-4' />
            <span>Open</span>
          </span>
        </Button>

        <div className='relative z-20'>
          <ProjectActionDropdown project={project} actions={actions} />
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
            <p>Any running agents will be stopped first. Their work so far is saved as revisions.</p>
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
