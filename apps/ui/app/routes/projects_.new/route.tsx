import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import type { KernelProvider } from '@taucad/runtime';
import type { FileSystemBackend } from '@taucad/types';
import { kernelConfigurations } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '#components/ui/card.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group.js';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#components/ui/accordion.js';
import { getKernelRequiredTier } from '@taucad/billing';
import { getKernelOption } from '#utils/kernel.utils.js';
import { KernelTierBadge, TierBadge } from '#components/tier-badge.js';
import { toast } from '#components/ui/sonner.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import type { Handle } from '#types/matches.types.js';
import { cn } from '#utils/ui.utils.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useKernel } from '#hooks/use-kernel.js';
import { BackendSelector, coerceFilesystemBackendCookie } from '#components/filesystem/backend-selector.js';
import type { SelectableFilesystemBackend } from '#components/filesystem/backend-selector.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { isWorkspaceDirectoryRequiredError } from '#filesystem/workspace-errors.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { useNewProjectWorkspacePicker } from '#routes/projects_.new/use-new-project-workspace-picker.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/projects/new'>New</Link>
      </Button>
    );
  },
  // Mobile: section scrolls as one page. Desktop: route uses h-full flex + inner list scroll (see layout).
  enableOverflowY: true,
};

// Reusable component for kernel details content
function KernelDetailsContent({ kernelId }: { readonly kernelId: KernelProvider }): React.JSX.Element {
  const selectedOption = getKernelOption(kernelId);
  return (
    <div className='space-y-4'>
      <TierBadge tier={getKernelRequiredTier(kernelId)} />
      <p className='text-sm leading-relaxed text-muted-foreground'>{selectedOption.longDescription}</p>

      <div className='space-y-3'>
        <Badge variant='default' className='text-xs font-medium'>
          Best for: {selectedOption.recommended}
        </Badge>

        <div className='space-y-2'>
          <h4 className='text-sm font-medium'>Tags:</h4>
          <div className='flex flex-wrap gap-1'>
            {selectedOption.tags.map((tag) => (
              <Badge key={tag} variant='secondary' className='text-xs'>
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className='space-y-2'>
          <h4 className='text-sm font-medium'>Key Features:</h4>
          <ul className='space-y-1 text-sm text-muted-foreground'>
            {selectedOption.features.map((feature) => (
              <li key={feature} className='flex items-center gap-2'>
                <div className='size-1.5 shrink-0 rounded-full bg-primary/60' />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Custom hook for project creation logic
function useProjectCreation() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const { data: sessionData } = useSession(authClient);
  const user = sessionData?.user;
  const projectManager = useProjectManager();

  const createProject = useCallback(
    async (projectData: {
      name: string;
      description: string;
      kernel: KernelProvider;
      backend: FileSystemBackend;
      workspaceId?: string;
    }) => {
      setIsCreating(true);
      try {
        const selectedOption = getKernelOption(projectData.kernel);

        const createProject = await projectManager.createProject({
          project: {
            name: projectData.name.trim(),
            description: projectData.description.trim(),
            author: {
              name: user?.name ?? 'You',
              avatar: user?.image ?? '/avatar-sample.png',
            },
            tags: [],
            thumbnail: '',
            assets: {
              mechanical: {
                main: selectedOption.mainFile,
                parameters: {},
              },
            },
          },
          files: {
            [selectedOption.mainFile]: {
              content: encodeTextFile(selectedOption.emptyCode),
            },
          },
          chatName: 'Initial design',
          backend: projectData.backend,
          workspaceId: projectData.workspaceId,
          // Set initial panel state: editor open
          editorState: {
            panelState: { openPanels: { editor: true, files: true } },
          },
        });

        void navigate(`/projects/${createProject.id}`);
      } catch (error) {
        setIsCreating(false);
        console.error('Failed to create project:', error);
        throw error;
      }
    },
    [user?.name, user?.image, projectManager, navigate],
  );

  return { createProject, isCreating };
}

export default function ProjectsNew(): React.JSX.Element {
  const navigate = useNavigate();
  const { createProject, isCreating } = useProjectCreation();
  const telemetry = useWorkspaceTelemetry();

  const { kernel, setKernel: setSelectedKernel } = useKernel();
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [backendCookie] = useCookie(cookieName.filesystemBackend, 'indexeddb');
  const [selectedBackend, setSelectedBackend] = useState<SelectableFilesystemBackend>(
    coerceFilesystemBackendCookie(backendCookie),
  );

  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId, workspaceStatus } = useNewProjectWorkspacePicker();

  const activeWorkspace = workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId);
  const backendBadge = selectedBackend === 'webaccess' && activeWorkspace ? activeWorkspace.name : undefined;

  const handleCreateProject = useCallback(async () => {
    try {
      await createProject({
        name: projectName,
        description: projectDescription,
        kernel,
        backend: selectedBackend,
        workspaceId: selectedBackend === 'webaccess' ? selectedWorkspaceId : undefined,
      });
    } catch (error) {
      // Structured workspace errors route to an actionable toast that
      // explains what the user must do next (Audit R2/R3). Anything else
      // is treated as a generic creation failure. Workspace management
      // (connect / grant access / change folder) is owned by Settings +
      // `/files` — this route only surfaces the picker, so the toast
      // routes the user there for any recoverable workspace failure.
      if (isWorkspaceDirectoryRequiredError(error)) {
        telemetry.projectCreateWebaccessBlocked({ reason: error.code });
        const toastLabelByCode = {
          missing: 'Connect a workspace folder to use the File System backend.',
          permission: 'Workspace access was revoked. Re-grant permission to continue.',
          unsupported: 'This browser does not support the File System Access API. Pick a different storage backend.',
        } as const;
        toast.error(toastLabelByCode[error.code], {
          action:
            error.code === 'unsupported'
              ? undefined
              : {
                  label: 'Manage Workspaces',
                  onClick: () => {
                    void navigate('/files');
                  },
                },
        });
        return;
      }
      toast.error('Failed to create project. Please try again.');
    }
  }, [
    projectName,
    projectDescription,
    kernel,
    selectedBackend,
    selectedWorkspaceId,
    createProject,
    navigate,
    telemetry,
  ]);

  const handleCancel = useCallback(() => {
    void navigate('/');
  }, [navigate]);

  // Block submit when webaccess is chosen but the workspace can't currently
  // accept writes. Mirrors the `WorkspaceDirectoryRequiredError` surface so
  // the user is never able to click Create and get a toast — the inline
  // picker below has already prompted them to recover (R7).
  const isWebAccessBlocked =
    selectedBackend === 'webaccess' && (workspaceStatus !== 'connected' || !selectedWorkspaceId);
  const isCreateButtonDisabled = !projectName.trim() || isCreating || isWebAccessBlocked;

  // Add keyboard shortcut for Enter to submit
  const { formattedKeyCombination } = useKeybinding(
    { key: 'Enter' },
    useCallback(() => {
      if (isCreateButtonDisabled) {
        toast.error('Please fill in all fields.');
      } else {
        void handleCreateProject();
      }
    }, [isCreateButtonDisabled, handleCreateProject]),
  );

  return (
    <div className='container mx-auto flex max-w-4xl flex-col px-4 pb-4 md:h-full md:min-h-0'>
      <div className='mb-4 shrink-0 text-center'>
        <h1 className='mb-2 text-3xl font-semibold tracking-tight'>Create New Project</h1>
        <p className='text-muted-foreground'>Choose a CAD kernel and start building</p>
      </div>

      <div className='md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden'>
        <Card className='flex flex-col bg-sidebar/70 md:min-h-0 md:flex-1 md:overflow-hidden'>
          <CardContent className='shrink-0 space-y-4 border-b pb-6'>
            <div className='flex flex-col gap-4'>
              <div className='flex-1 space-y-2'>
                <Label htmlFor='project-name'>Project Name *</Label>
                <Input
                  autoFocus
                  autoComplete='off'
                  id='project-name'
                  value={projectName}
                  placeholder='Enter your project name...'
                  maxLength={100}
                  onChange={(event) => {
                    setProjectName(event.target.value);
                  }}
                />
              </div>
              <div className='flex-1 space-y-2'>
                <Label htmlFor='project-description'>Description (optional)</Label>
                <Input
                  id='project-description'
                  value={projectDescription}
                  placeholder="Describe what you're building..."
                  maxLength={500}
                  onChange={(event) => {
                    setProjectDescription(event.target.value);
                  }}
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Storage Backend</Label>
              <BackendSelector
                value={selectedBackend}
                badge={backendBadge}
                onSelect={(value) => {
                  setSelectedBackend(value as SelectableFilesystemBackend);
                }}
              />
              <p className='text-xs text-muted-foreground'>
                Where project files are stored. Can be changed later in project settings.
              </p>

              {selectedBackend === 'webaccess' && workspaces.length > 1 ? (
                <div className='flex flex-col gap-1.5 pt-2'>
                  <Label className='text-xs text-muted-foreground'>Workspace</Label>
                  <Select
                    value={selectedWorkspaceId ?? undefined}
                    onValueChange={(value) => {
                      setSelectedWorkspaceId(value);
                    }}
                  >
                    <SelectTrigger className='w-full bg-background'>
                      <SelectValue placeholder='Pick a workspace' />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
                          {workspace.name}
                          {workspace.isDefault ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : undefined}
            </div>
          </CardContent>

          <CardHeader className='shrink-0 text-sm'>
            <CardTitle className='font-medium'>Choose CAD Kernel *</CardTitle>
            <CardDescription>Select the technology that best fits your project needs</CardDescription>
          </CardHeader>
          <CardContent className='md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden'>
            {/* Mobile Accordion Layout */}
            <div className='block rounded-lg border border-border bg-card md:hidden'>
              <RadioGroup
                value={kernel}
                onValueChange={(value) => {
                  setSelectedKernel(value as KernelProvider);
                }}
              >
                <Accordion
                  type='single'
                  value={kernel}
                  onValueChange={(value) => {
                    if (value) {
                      setSelectedKernel(value as KernelProvider);
                    }
                  }}
                >
                  {kernelConfigurations.map((option) => (
                    <AccordionItem
                      key={option.id}
                      value={option.id}
                      className={cn(
                        'border-b border-border last:border-b-0 transition-all',
                        kernel === option.id && 'bg-primary/5',
                      )}
                    >
                      <div className='flex items-start gap-3 p-4'>
                        <RadioGroupItem value={option.id} id={`mobile-${option.id}`} className='mt-1' />
                        <div className='min-w-0 flex-1'>
                          <AccordionTrigger
                            className={cn(
                              'flex h-auto w-full cursor-pointer items-start justify-between gap-3 border-0 p-0 text-left transition-all hover:no-underline',
                              'bg-transparent hover:bg-transparent data-[state=open]:bg-transparent',
                            )}
                          >
                            <div className='flex flex-1 items-start gap-3'>
                              <SvgIcon id={option.id} className='mt-0.5 size-6 shrink-0' />
                              <div className='flex w-full min-w-0 flex-col gap-1'>
                                <div className='flex w-full items-start justify-between gap-2'>
                                  <span className='flex items-center gap-1.5 text-sm font-medium'>
                                    {option.name}
                                    <KernelTierBadge kernelId={option.id} />
                                  </span>
                                  <span className='font-mono text-xs text-muted-foreground/70'>
                                    {option.backendProvider}
                                  </span>
                                </div>
                                <span className='text-xs leading-relaxed text-muted-foreground'>
                                  {option.description}
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                        </div>
                      </div>
                      <AccordionContent className='px-4 pb-4'>
                        <KernelDetailsContent kernelId={option.id} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </RadioGroup>
            </div>

            {/* Desktop: only the kernel list column scrolls */}
            <div className='hidden min-h-0 md:flex md:flex-1 md:gap-6'>
              <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card md:basis-1/2'>
                <div className='min-h-0 flex-1 scroll-shadows-y overflow-y-auto'>
                  <RadioGroup
                    value={kernel}
                    className='gap-0'
                    onValueChange={(value) => {
                      setSelectedKernel(value as KernelProvider);
                    }}
                  >
                    {kernelConfigurations.map((option) => (
                      <Label
                        key={option.id}
                        htmlFor={option.id}
                        className={cn(
                          'flex h-auto cursor-pointer items-start justify-start gap-3 border-b border-border p-4 text-left transition-all last:border-b-0 hover:bg-primary/5',
                          kernel === option.id && 'bg-primary/5 hover:bg-primary/10',
                        )}
                      >
                        <RadioGroupItem value={option.id} id={option.id} className='mt-1' />
                        <SvgIcon id={option.id} className='mt-0.5 size-6 shrink-0' />
                        <div className='flex w-full min-w-0 flex-col gap-1'>
                          <div className='flex w-full items-start justify-between gap-2'>
                            <span className='flex items-center gap-1.5 text-sm font-medium'>
                              {option.name}
                              <KernelTierBadge kernelId={option.id} />
                            </span>
                            <span className='font-mono text-xs text-muted-foreground/70'>{option.backendProvider}</span>
                          </div>
                          <span className='text-xs leading-relaxed text-muted-foreground'>{option.description}</span>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              </div>

              <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-card p-6 md:basis-1/2'>
                <KernelDetailsContent kernelId={kernel} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='flex shrink-0 flex-col gap-3 pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:gap-4'>
        <Button variant='outline' disabled={isCreating} onClick={handleCancel}>
          Cancel
        </Button>
        <Button disabled={isCreateButtonDisabled} className='min-w-[120px]' onClick={handleCreateProject}>
          {isCreating ? 'Creating...' : `Create Project ${formattedKeyCombination}`}
        </Button>
      </div>
    </div>
  );
}
