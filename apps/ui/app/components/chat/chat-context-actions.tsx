import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { AtSign, Image, AlertTriangle, AlertCircle, Camera } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { CodeIssue, ScreenshotOverlay } from '@taucad/types';
import type { KernelIssue } from '@taucad/runtime';
import { TooltipTrigger, TooltipContent, Tooltip } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { useProject, useMainGraphics } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { orthographicViews, screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { cn } from '#utils/ui.utils.js';
import { menuItemLayoutClass } from '#components/ui/menu.variants.js';
import { useImageQuality } from '#hooks/use-image-quality.js';
import { buildScreenshotOverlayForPath, resolveScreenshotOverlay } from '#machines/resolve-screenshot-overlay.js';

type ChatContextActionsProperties = {
  readonly addImage: (image: string) => void;
  readonly addText: (text: string) => void;
  readonly asPopoverMenu?: boolean;
  readonly onClose?: () => void;
  readonly searchQuery?: string;
  readonly selectedIndex?: number;
  readonly onSelectedIndexChange?: (index: number) => void;
  readonly onSelectItem?: (text: string) => void;
  readonly className?: string;
};

type ContextActionItem = {
  id: string;
  label: string;
  group: string;
  icon: React.JSX.Element;
  action: () => void;
  disabled?: boolean;
};

export function ChatContextActions({
  addImage,
  addText,
  asPopoverMenu,
  onClose,
  searchQuery = '',
  selectedIndex,
  onSelectedIndexChange,
  onSelectItem,
  className,
  ...properties
}: ChatContextActionsProperties): React.JSX.Element {
  const { geometryUnits, mainEntryFile, viewGraphics, editorRef } = useProject();
  const mainGraphicsRef = useMainGraphics();
  const cadActor = geometryUnits.get(mainEntryFile);

  const isScreenshotReady = useSelector(mainGraphicsRef, (state) => state?.context.isScreenshotReady ?? false);
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);

  // Get the kernel error for the main entry file from its geometry unit
  const kernelIssue = useSelector(cadActor, (state) => {
    if (!state || !mainEntryFile) {
      return undefined;
    }

    return state.context.kernelIssues.get(mainEntryFile);
  });

  const codeIssues = useSelector(cadActor, (state) => state?.context.codeIssues ?? []);
  const { quality: screenshotQuality } = useImageQuality();

  // Reactively track isScreenshotReady for all view graphics actors.
  // getSnapshot() inside useMemo is a one-time read; we need subscriptions so that
  // when a view's capability registers asynchronously, the menu item updates.
  const [viewReadiness, setViewReadiness] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Seed initial state from current snapshots
    const initial: Record<string, boolean> = {};
    for (const [viewId, graphicsRef] of viewGraphics) {
      initial[viewId] = graphicsRef.getSnapshot().context.isScreenshotReady;
    }

    setViewReadiness(initial);

    // Subscribe to future changes
    const subscriptions: Array<{ unsubscribe: () => void }> = [];
    for (const [viewId, graphicsRef] of viewGraphics) {
      const subscription = graphicsRef.subscribe((snapshot) => {
        setViewReadiness((previous) => {
          const ready = snapshot.context.isScreenshotReady;
          if (previous[viewId] === ready) {
            return previous;
          }

          return { ...previous, [viewId]: ready };
        });
      });
      subscriptions.push(subscription);
    }

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }, [viewGraphics]);

  // Track active screenshot actors for lifecycle cleanup
  const activeScreenshotActorsRef = useRef(new Set<{ stop: () => void }>());

  useEffect(() => {
    const actors = activeScreenshotActorsRef;
    return () => {
      for (const actor of actors.current) {
        actor.stop();
      }

      actors.current.clear();
    };
  }, []);

  // Helper to take a screenshot of a specific view's graphicsRef (creates actor on-demand)
  const takeScreenshot = useCallback(
    (
      graphicsRef: ActorRefFrom<typeof graphicsMachine>,
      options: {
        type: 'single' | 'composite';
        overlay?: ScreenshotOverlay;
        onSuccess: (dataUrls: string[]) => void;
        onError: (error: unknown) => void;
      },
    ) => {
      const actor = createActor(screenshotRequestMachine, {
        input: { graphicsRef },
      });
      const actors = activeScreenshotActorsRef.current;
      actors.add(actor);
      actor.start();

      const cleanup = () => {
        actor.stop();
        actors.delete(actor);
      };

      if (options.type === 'single') {
        actor.send({
          type: 'requestScreenshot',
          options: {
            output: {
              format: 'image/webp',
              quality: screenshotQuality,
            },
            aspectRatio: 16 / 9,
            maxResolution: 1200,
            zoomLevel: 1.4,
            overlay: options.overlay,
          },
          onSuccess(dataUrls) {
            cleanup();
            options.onSuccess(dataUrls);
          },
          onError(error) {
            cleanup();
            options.onError(error);
          },
        });
      } else {
        actor.send({
          type: 'requestCompositeScreenshot',
          options: {
            output: {
              format: 'image/webp',
              quality: screenshotQuality,
              isPreview: true,
            },
            cameraAngles: orthographicViews.slice(0, 6),
            aspectRatio: 1,
            maxResolution: 800,
            zoomLevel: 1.2,
            overlay: options.overlay,
            composite: {
              enabled: true,
              preferredRatio: { columns: 3, rows: 2 },
              showLabels: true,
              padding: 12,
              labelHeight: 24,
              backgroundColor: 'transparent',
              dividerColor: 'var(--border)',
              dividerWidth: 1,
            },
          },
          onSuccess(dataUrls) {
            cleanup();
            options.onSuccess(dataUrls);
          },
          onError(error) {
            cleanup();
            options.onError(error);
          },
        });
      }
    },
    [screenshotQuality],
  );

  /** Resolve the overlay for the main entry — used by the main-view + composite handlers. */
  const resolveMainOverlay = useCallback((): ScreenshotOverlay | undefined => {
    return (
      resolveScreenshotOverlay(cadActor) ?? (mainEntryFile ? buildScreenshotOverlayForPath(mainEntryFile) : undefined)
    );
  }, [cadActor, mainEntryFile]);

  const handleViewScreenshot = useCallback(
    (graphicsRef: ActorRefFrom<typeof graphicsMachine>, viewEntryFile: string | undefined) => {
      if (asPopoverMenu) {
        onClose?.();
      }

      const overlay =
        resolveScreenshotOverlay(viewEntryFile ? geometryUnits.get(viewEntryFile) : undefined) ??
        (viewEntryFile ? buildScreenshotOverlayForPath(viewEntryFile) : undefined);

      takeScreenshot(graphicsRef, {
        type: 'single',
        overlay,
        onSuccess(dataUrls) {
          const dataUrl = dataUrls[0];
          if (dataUrl) {
            addImage(dataUrl);
          } else {
            console.error('No screenshot data received');
            toast.error('Failed to capture view screenshot');
          }
        },
        onError(error) {
          console.error('View screenshot failed:', error);
          toast.error(`View screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
        },
      });
    },
    [addImage, asPopoverMenu, onClose, takeScreenshot, geometryUnits],
  );

  const handleAddModelScreenshot = useCallback(() => {
    if (!mainGraphicsRef) {
      return;
    }

    if (asPopoverMenu) {
      onClose?.();
    }

    takeScreenshot(mainGraphicsRef, {
      type: 'single',
      overlay: resolveMainOverlay(),
      onSuccess(dataUrls) {
        const dataUrl = dataUrls[0];
        if (dataUrl) {
          addImage(dataUrl);
        } else {
          console.error('No screenshot data received');
          toast.error('Failed to capture model screenshot');
        }
      },
      onError(error) {
        console.error('Screenshot failed:', error);
        toast.error(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
      },
    });
  }, [addImage, asPopoverMenu, onClose, takeScreenshot, mainGraphicsRef, resolveMainOverlay]);

  const handleAddAllViewsScreenshots = useCallback(() => {
    if (!mainGraphicsRef) {
      return;
    }

    if (asPopoverMenu) {
      onClose?.();
    }

    takeScreenshot(mainGraphicsRef, {
      type: 'composite',
      overlay: resolveMainOverlay(),
      onSuccess(dataUrls) {
        const compositeDataUrl = dataUrls[0];
        if (compositeDataUrl) {
          addImage(compositeDataUrl);
        } else {
          console.error('No composite screenshot data received');
          toast.error('Failed to capture all views screenshot');
        }
      },
      onError(error) {
        console.error('All views screenshot failed:', error);
        toast.error(`All views screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
      },
    });
  }, [addImage, asPopoverMenu, onClose, takeScreenshot, mainGraphicsRef, resolveMainOverlay]);

  const handleAddCodeIssues = useCallback(() => {
    const errors = codeIssues.map(
      (error: CodeIssue) => `- (${error.startLineNumber}:${error.startColumn}): ${error.message}`,
    );

    const markdownErrors = `
# Code errors
${errors.join('\n')}
`;
    addText(markdownErrors);
    if (asPopoverMenu) {
      onClose?.();
    }
  }, [addText, codeIssues, asPopoverMenu, onClose]);

  const handleAddKernelIssue = useCallback(() => {
    if (!kernelIssue || kernelIssue.length === 0) {
      return;
    }

    // Format all kernel issues
    const errorsMarkdown = kernelIssue
      .map((error: KernelIssue, index: number) => {
        const locationInfo = error.location
          ? ` (Line ${error.location.startLineNumber}:${error.location.startColumn})`
          : '';

        const headerPrefix = kernelIssue.length > 1 ? `## Error ${index + 1}` : '# Kernel error';

        return `${headerPrefix}${locationInfo}
${error.message}
${error.stack ? `\n\`\`\`\n${error.stack}\n\`\`\`` : ''}`;
      })
      .join('\n\n');

    const header = kernelIssue.length > 1 ? `# Kernel issues (${kernelIssue.length})\n\n` : '';
    addText(`${header}${errorsMarkdown}\n`);

    if (asPopoverMenu) {
      onClose?.();
    }
  }, [addText, kernelIssue, asPopoverMenu, onClose]);

  const contextItems = useMemo((): ContextActionItem[] => {
    const items: ContextActionItem[] = [
      {
        id: 'add-current-view-screenshot',
        label: 'Current view',
        group: 'Screenshot',
        icon: <Image />,
        action: handleAddModelScreenshot,
        disabled: !isScreenshotReady,
      },
      {
        id: 'add-all-views-screenshots',
        label: 'Orthographic views x 6',
        group: 'Screenshot',
        icon: <Camera />,
        action: handleAddAllViewsScreenshots,
        disabled: !isScreenshotReady,
      },
    ];

    // Add per-view screenshot items for non-main views when there are 2+ views
    if (viewGraphics.size >= 2) {
      for (const [viewId, graphicsRef] of viewGraphics) {
        const settings = viewSettings[viewId];
        // Skip the main entry file view (already covered by "Current view screenshot")
        if (settings?.entryFile === mainEntryFile) {
          continue;
        }

        const fileName = settings?.entryFile?.split('/').pop() ?? 'Untitled';
        const isReady = viewReadiness[viewId] ?? false;
        items.push({
          id: `view-screenshot-${viewId}`,
          label: fileName,
          group: 'View Screenshots',
          icon: <Image />,
          action() {
            handleViewScreenshot(graphicsRef, settings?.entryFile);
          },
          disabled: !isReady,
        });
      }
    }

    items.push(
      {
        id: 'add-code-errors',
        label: 'Code errors',
        group: 'Code',
        icon: <AlertTriangle />,
        action: handleAddCodeIssues,
        disabled: codeIssues.length === 0,
      },
      {
        id: 'add-kernel-error',
        label: kernelIssue && kernelIssue.length > 1 ? `Kernel issues (${kernelIssue.length})` : 'Kernel error',
        group: 'Code',
        icon: <AlertCircle />,
        action: handleAddKernelIssue,
        disabled: !kernelIssue || kernelIssue.length === 0,
      },
    );

    return items;
  }, [
    handleAddModelScreenshot,
    isScreenshotReady,
    handleAddAllViewsScreenshots,
    handleAddCodeIssues,
    codeIssues.length,
    handleAddKernelIssue,
    kernelIssue,
    viewGraphics,
    viewSettings,
    viewReadiness,
    mainEntryFile,
    handleViewScreenshot,
  ]);

  const groupedContextItems = useMemo(() => {
    const groupedContextItemsMap: Record<string, { name: string; items: ContextActionItem[] }> = {};
    const groupOrder: string[] = [];

    for (const item of contextItems) {
      if (!groupedContextItemsMap[item.group]) {
        groupedContextItemsMap[item.group] = { name: item.group, items: [] };
        groupOrder.push(item.group);
      }

      groupedContextItemsMap[item.group]!.items.push(item);
    }

    return Object.values(groupedContextItemsMap).sort(
      (a, b) => groupOrder.indexOf(a.name) - groupOrder.indexOf(b.name),
    );
  }, [contextItems]);

  const renderContextItemLabel = (item: ContextActionItem, _selectedItem: ContextActionItem | undefined) => (
    <div className={menuItemLayoutClass}>
      {item.icon}
      {item.label}
    </div>
  );

  const getContextItemValue = (item: ContextActionItem) => item.id;
  const isContextItemDisabled = (item: ContextActionItem) => Boolean(item.disabled);

  // Filter items based on search query when in popover mode
  const filteredGroupedItems = useMemo(() => {
    if (!asPopoverMenu || !searchQuery) {
      return groupedContextItems;
    }

    const query = searchQuery.toLowerCase();
    return groupedContextItems
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.label.toLowerCase().includes(query) || item.group.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedContextItems, asPopoverMenu, searchQuery]);

  // Flatten filtered items for keyboard navigation
  const flattenedItems = useMemo(() => {
    return filteredGroupedItems.flatMap((group) => group.items.filter((item) => !item.disabled));
  }, [filteredGroupedItems]);

  // Update selected index bounds when items change
  useEffect(() => {
    if (
      asPopoverMenu &&
      selectedIndex !== undefined &&
      onSelectedIndexChange &&
      selectedIndex >= flattenedItems.length
    ) {
      onSelectedIndexChange(Math.max(0, flattenedItems.length - 1));
    }
  }, [asPopoverMenu, selectedIndex, onSelectedIndexChange, flattenedItems.length]);

  // Handle keyboard selection
  // @ts-expect-error: todo: separate into multiple components
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!asPopoverMenu || selectedIndex === undefined || !onSelectedIndexChange) {
        return;
      }

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          onSelectedIndexChange(Math.min(flattenedItems.length - 1, selectedIndex + 1));

          break;
        }

        case 'ArrowUp': {
          event.preventDefault();
          onSelectedIndexChange(Math.max(0, selectedIndex - 1));

          break;
        }

        case 'Enter': {
          event.preventDefault();
          const selectedItem = flattenedItems[selectedIndex];
          if (selectedItem && onSelectItem) {
            selectedItem.action();
          }

          break;
        }
        // No default
      }
    };

    if (asPopoverMenu) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [asPopoverMenu, selectedIndex, onSelectedIndexChange, flattenedItems, onSelectItem]);

  // If used as a popover menu, return just the menu content
  if (asPopoverMenu) {
    let currentFlatIndex = 0;

    return (
      <div className={cn('max-h-64 overflow-y-auto', className)}>
        {filteredGroupedItems.map((group) => (
          <div key={group.name}>
            <div className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>{group.name}</div>
            {group.items.map((item) => {
              const isSelected = selectedIndex === currentFlatIndex && !item.disabled;
              const itemFlatIndex = currentFlatIndex;
              if (!item.disabled) {
                currentFlatIndex++;
              }

              return (
                <button
                  key={item.id}
                  type='button'
                  className={`hover:text-accent-foreground flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected ? 'text-accent-foreground bg-accent' : ''
                  }`}
                  disabled={isContextItemDisabled(item)}
                  onClick={() => {
                    item.action();
                  }}
                  onMouseEnter={() => {
                    if (!item.disabled && onSelectedIndexChange) {
                      onSelectedIndexChange(itemFlatIndex);
                    }
                  }}
                >
                  {renderContextItemLabel(item, undefined)}
                </button>
              );
            })}
          </div>
        ))}
        {filteredGroupedItems.length === 0 && (
          <div className='px-2 py-4 text-center text-sm text-muted-foreground'>No results found</div>
        )}
      </div>
    );
  }

  return (
    <Tooltip>
      <ComboBoxResponsive<ContextActionItem>
        groupedItems={groupedContextItems}
        renderLabel={renderContextItemLabel}
        getValue={getContextItemValue}
        isDisabled={isContextItemDisabled}
        popoverProperties={{
          align: 'start',
          side: 'top',
          className: 'w-60',
        }}
        searchPlaceHolder='Search context...'
        placeholder='Add context'
        title='Add chat context'
        description='Provide additional context for the chat. This will be used to generate a response.'
        onSelect={(itemId) => {
          const selectedItem = contextItems.find((item) => item.id === itemId);
          selectedItem?.action();
        }}
        {...properties}
      >
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='icon'
            className='size-7 rounded-full text-muted-foreground hover:text-foreground'
          >
            <AtSign className='size-3.5' />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>Add context</TooltipContent>
    </Tooltip>
  );
}
