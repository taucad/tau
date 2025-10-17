import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuthenticate } from '@daveyplate/better-auth-ui';
import type { KernelProvider } from '@taucad/types';
import { kernelConfigurations } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '#components/ui/card.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group.js';
import { Textarea } from '#components/ui/textarea.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#components/ui/accordion.js';
import { storage } from '#db/storage.js';
import { getKernelOption } from '#utils/kernel.utils.js';
import { toast } from '#components/ui/sonner.js';
import type { Handle } from '#types/matches.types.js';
import { cn } from '#utils/ui.utils.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost">
        <Link to="/builds/new">New</Link>
      </Button>
    );
  },
};

// Reusable component for kernel details content
function KernelDetailsContent({ kernelId }: { readonly kernelId: KernelProvider }): React.JSX.Element {
  const selectedOption = getKernelOption(kernelId);
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{selectedOption.longDescription}</p>

      <div className="space-y-3">
        <Badge variant="default" className="text-xs font-medium">
          Best for: {selectedOption.recommended}
        </Badge>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Tags:</h4>
          <div className="flex flex-wrap gap-1">
            {selectedOption.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Key Features:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {selectedOption.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <div className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Custom hook for build creation logic
function useBuildCreation() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const { user } = useAuthenticate({ enabled: false });

  const createBuild = useCallback(
    async (buildData: { name: string; description: string; kernel: KernelProvider }) => {
      setIsCreating(true);
      try {
        const selectedOption = getKernelOption(buildData.kernel);

        const build = await storage.createBuild({
          name: buildData.name.trim(),
          description: buildData.description.trim(),
          stars: 0,
          forks: 0,
          author: {
            name: user?.name ?? 'You',
            avatar: user?.image ?? '/avatar-sample.png',
          },
          tags: [],
          thumbnail: '',
          chats: [],
          assets: {
            mechanical: {
              files: {
                [selectedOption.mainFile]: {
                  content: selectedOption.emptyCode,
                },
              },
              main: selectedOption.mainFile,
              language: buildData.kernel,
              parameters: {},
            },
          },
        });

        void navigate(`/builds/${build.id}`);
      } catch (error) {
        console.error('Failed to create build:', error);
        throw error;
      } finally {
        setIsCreating(false);
      }
    },
    [navigate, user?.image, user?.name],
  );

  return { createBuild, isCreating };
}

export default function BuildsNew(): React.JSX.Element {
  const navigate = useNavigate();
  const { createBuild, isCreating } = useBuildCreation();

  const [selectedKernel, setSelectedKernel] = useCookie<KernelProvider>(cookieName.cadKernel, 'openscad');
  const [buildName, setBuildName] = useState('');
  const [buildDescription, setBuildDescription] = useState('');

  const handleCreateBuild = useCallback(async () => {
    try {
      await createBuild({
        name: buildName,
        description: buildDescription,
        kernel: selectedKernel,
      });
    } catch {
      toast.error('Failed to create build. Please try again.');
    }
  }, [buildName, buildDescription, selectedKernel, createBuild]);

  const handleCancel = useCallback(() => {
    void navigate('/');
  }, [navigate]);

  const isCreateButtonDisabled = !buildName.trim() || isCreating;

  // Add keyboard shortcut for Enter to submit
  const { formattedKeyCombination } = useKeydown(
    { key: 'Enter' },
    useCallback(() => {
      if (isCreateButtonDisabled) {
        toast.error('Please fill in all fields.');
      } else {
        void handleCreateBuild();
      }
    }, [isCreateButtonDisabled, handleCreateBuild]),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 pb-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Create New Build</h1>
        <p className="text-muted-foreground">Choose a CAD kernel and start building</p>
      </div>

      <div className="space-y-6">
        {/* Build Details */}
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="build-name">Build Name *</Label>
              <Input
                autoFocus
                autoComplete="off"
                id="build-name"
                value={buildName}
                placeholder="Enter your build name..."
                maxLength={100}
                onChange={(event) => {
                  setBuildName(event.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="build-description">Description (optional)</Label>
              <Textarea
                id="build-description"
                value={buildDescription}
                placeholder="Describe what you're building..."
                maxLength={500}
                rows={3}
                onChange={(event) => {
                  setBuildDescription(event.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Kernel Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Choose CAD Kernel *</CardTitle>
            <CardDescription>Select the technology that best fits your build needs</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile Accordion Layout */}
            <div className="block md:hidden">
              <RadioGroup
                value={selectedKernel}
                onValueChange={(value) => {
                  setSelectedKernel(value as KernelProvider);
                }}
              >
                <Accordion
                  type="single"
                  value={selectedKernel}
                  className="space-y-2"
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
                        'rounded-lg border transition-all',
                        selectedKernel === option.id && 'border-ring bg-primary/5 ring-3 ring-ring/50',
                      )}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <RadioGroupItem value={option.id} id={`mobile-${option.id}`} className="mt-1" />
                        <div className="min-w-0 flex-1">
                          <AccordionTrigger
                            className={cn(
                              'flex h-auto w-full cursor-pointer items-start justify-between gap-3 border-0 p-0 text-left transition-all hover:no-underline',
                              'bg-transparent hover:bg-transparent data-[state=open]:bg-transparent',
                            )}
                          >
                            <div className="flex flex-1 items-start gap-3">
                              <SvgIcon id={option.id} className="mt-0.5 size-6 shrink-0" />
                              <div className="flex w-full min-w-0 flex-col gap-1">
                                <div className="flex w-full items-start justify-between gap-2">
                                  <span className="text-sm font-medium">{option.name}</span>
                                  <span className="font-mono text-xs text-muted-foreground/70">
                                    {option.backendProvider}
                                  </span>
                                </div>
                                <span className="text-xs leading-relaxed text-muted-foreground">
                                  {option.description}
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                        </div>
                      </div>
                      <AccordionContent className="px-4 pb-4">
                        <KernelDetailsContent kernelId={option.id} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </RadioGroup>
            </div>

            {/* Desktop Side-by-Side Layout */}
            <div className="hidden md:flex md:gap-6">
              {/* Left side - Radio Group */}
              <div className="flex flex-col gap-2 md:min-w-80">
                <RadioGroup
                  value={selectedKernel}
                  className="space-y-2"
                  onValueChange={(value) => {
                    setSelectedKernel(value as KernelProvider);
                  }}
                >
                  {kernelConfigurations.map((option) => (
                    <Label
                      key={option.id}
                      htmlFor={option.id}
                      className={cn(
                        'flex h-auto cursor-pointer items-start justify-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5',
                        selectedKernel === option.id &&
                          'border-ring bg-primary/5 ring-3 ring-ring/50 hover:border-ring hover:bg-primary/10',
                      )}
                    >
                      <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                      <SvgIcon id={option.id} className="mt-0.5 size-6 shrink-0" />
                      <div className="flex w-full min-w-0 flex-col gap-1">
                        <div className="flex w-full items-start justify-between gap-2">
                          <span className="text-sm font-medium">{option.name}</span>
                          <span className="font-mono text-xs text-muted-foreground/70">{option.backendProvider}</span>
                        </div>
                        <span className="text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Right side - Content panel */}
              <div className="flex-1 rounded-lg border border-border bg-card p-6">
                <KernelDetailsContent kernelId={selectedKernel} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <Button variant="outline" disabled={isCreating} onClick={handleCancel}>
            Cancel
          </Button>
          <Button disabled={isCreateButtonDisabled} className="min-w-[120px]" onClick={handleCreateBuild}>
            {isCreating ? 'Creating...' : `Create Build ${formattedKeyCombination}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
