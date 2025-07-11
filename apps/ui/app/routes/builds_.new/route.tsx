import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { JSX } from 'react';
import { useAuthenticate } from '@daveyplate/better-auth-ui';
import { Button } from '~/components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card.js';
import { Input } from '~/components/ui/input.js';
import { Label } from '~/components/ui/label.js';
import { Badge } from '~/components/ui/badge.js';
import { SvgIcon } from '~/components/icons/svg-icon.js';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group.js';
import { Textarea } from '~/components/ui/textarea.js';
import { storage } from '~/db/storage.js';
import { kernelOptions, getKernelOption } from '~/constants/kernel.constants.js';
import { toast } from '~/components/ui/sonner.js';
import type { KernelProvider } from '~/types/kernel.types';
import type { Handle } from '~/types/matches.types.js';
import { cn } from '~/utils/ui.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import useCookie from '~/hooks/use-cookie.js';
import { cookieName } from '~/constants/cookie.constants.js';

export const handle: Handle = {
  breadcrumb() {
    return <span className="p-2 text-sm font-medium">New</span>;
  },
};

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
        if (!selectedOption) {
          throw new Error('Invalid kernel selection');
        }

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

export default function BuildsNew(): JSX.Element {
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

  const isCreateButtonDisabled = !selectedKernel || !buildName.trim() || isCreating;

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
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Create New Build</h1>
        <p className="text-muted-foreground">Choose a CAD kernel and start building</p>
      </div>

      <div className="space-y-6">
        {/* Build Details */}
        <Card>
          <CardHeader>
            <CardTitle>Build Details</CardTitle>
            <CardDescription>Give your build a name and description</CardDescription>
          </CardHeader>
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
            <RadioGroup
              value={selectedKernel}
              className="space-y-4"
              onValueChange={(value) => {
                setSelectedKernel(value as KernelProvider);
              }}
            >
              {kernelOptions.map((option) => (
                <div key={option.id} className="space-y-3">
                  <Label
                    htmlFor={option.id}
                    className={cn(
                      'relative block cursor-pointer rounded-lg border p-4 transition-all',
                      selectedKernel === option.id
                        ? 'border-ring bg-primary/5 ring-[3px] ring-ring/50 dark:bg-primary/10'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <RadioGroupItem value={option.id} id={option.id} className="absolute top-4 left-4 z-10" />
                    <div className="flex flex-col space-y-3 pl-8">
                      <div className="flex items-start gap-4 sm:items-center">
                        <SvgIcon id={option.id} className="size-12 min-w-12 rounded-lg bg-muted p-2" />
                        <div>
                          <h3 className="text-lg font-semibold">{option.name}</h3>
                          <p className="text-sm text-muted-foreground italic">{option.description}</p>
                        </div>
                      </div>
                      <div className="w-full space-y-2">
                        <p className="text-sm leading-relaxed font-normal text-muted-foreground">
                          {option.longDescription}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {option.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs font-medium text-primary">
                          Best for: {option.recommended}
                        </Badge>
                      </div>
                    </div>
                  </Label>

                  {/* Feature list and examples */}
                  {selectedKernel === option.id && (
                    <div className="mx-4 space-y-3 border-t border-primary/20 pt-4">
                      <h4 className="mb-2 text-center text-sm font-medium">Key Features:</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {option.features.map((feature) => (
                          <li key={feature} className="flex items-center justify-center gap-2">
                            <div className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                            <span className="text-center">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between gap-4">
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
