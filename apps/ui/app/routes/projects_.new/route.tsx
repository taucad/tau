import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import type { KernelProvider } from '@taucad/runtime';
import { kernelConfigurations } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '#components/ui/card.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group.js';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';

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
import { useProjectCreationLocation } from '#hooks/use-project-creation-location.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { projectLocationDescriptor, projectLocationFullLabel } from '#utils/project-creation-location.utils.js';
import { projectUrl } from '#utils/project-url.utils.js';

const homeLocationLabel = projectLocationFullLabel(projectLocationDescriptor({ kind: 'home' }));

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
  const projectManager = useProjectManager();

  const createProject = useCallback(
    async (projectData: {
      name: string;
      description: string;
      kernel: KernelProvider;
      location: ProjectCreationLocation;
    }) => {
      setIsCreating(true);
      try {
        const selectedOption = getKernelOption(projectData.kernel);

        const createProject = await projectManager.createProject({
          project: {
            name: projectData.name.trim(),
            description: projectData.description.trim(),
            tags: [],
            assets: {
              main: {
                entryPath: selectedOption.mainFile,
              },
            },
          },
          files: {
            [selectedOption.mainFile]: {
              content: encodeTextFile(selectedOption.emptyCode),
            },
          },
          chatName: 'Initial design',
          location: projectData.location,
          // Start in the code-oriented Workbench lane.
          editorState: {
            panelState: {
              desktopLayout: { workbenchOpen: true, compactAuxiliary: 'workbench' },
              mobileActiveTab: 'editor',
            },
          },
        });

        await navigate(projectUrl(createProject.slugs));
      } catch (error) {
        setIsCreating(false);
        console.error('Failed to create project:', error);
        throw error;
      }
    },
    [projectManager, navigate],
  );

  return { createProject, isCreating };
}

export default function ProjectsNew(): React.JSX.Element {
  const navigate = useNavigate();
  const { createProject, isCreating } = useProjectCreation();
  const location = useProjectCreationLocation();
  const presentLocationError = useProjectCreationLocationError();

  const { kernel, setKernel: setSelectedKernel } = useKernel();
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const handleCreateProject = useCallback(async () => {
    if (location.phase !== 'ready') {
      return;
    }
    try {
      await createProject({
        name: projectName,
        description: projectDescription,
        kernel,
        location: location.value,
      });
    } catch (error) {
      if (presentLocationError(error)) {
        if (location.hasWebAccessCapability) {
          await location.refresh();
        }
        return;
      }
      toast.error('Failed to create project. Please try again.');
    }
  }, [createProject, kernel, location, presentLocationError, projectDescription, projectName]);

  const handleCancel = useCallback(() => {
    void navigate('/');
  }, [navigate]);

  const isCreateButtonDisabled = !projectName.trim() || isCreating || !location.canCreate;

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
              <Label>Location</Label>
              {location.shouldShowPicker ? (
                <WorkspaceSelector state={location} variant='field' />
              ) : (
                <p className='text-sm'>{homeLocationLabel}</p>
              )}
              <p className='text-xs text-muted-foreground'>
                Browser storage can be cleared or evicted. Export important work.
              </p>
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
                      <div
                        className='flex cursor-pointer items-start gap-3 p-4'
                        onClick={() => {
                          setSelectedKernel(option.id);
                        }}
                      >
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
                        onClick={() => {
                          setSelectedKernel(option.id);
                        }}
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
