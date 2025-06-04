import { useCallback, useMemo, useEffect } from 'react';
import type { JSX } from 'react';
import { AtSign, Image, Code, AlertTriangle, AlertCircle, Camera } from 'lucide-react';
import { useSelector, useActorRef } from '@xstate/react';
import { TooltipTrigger, TooltipContent, Tooltip } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import { toast } from '~/components/ui/sonner.js';
import { ComboBoxResponsive } from '~/components/ui/combobox-responsive.js';
import { orthographicViews, screenshotRequestMachine } from '~/machines/screenshot-request.js';

type ChatContextActionsProperties = {
  readonly addImage: (image: string) => void;
  readonly addText: (text: string) => void;
  readonly asPopoverMenu?: boolean;
  readonly onClose?: () => void;
  readonly searchQuery?: string;
  readonly selectedIndex?: number;
  readonly onSelectedIndexChange?: (index: number) => void;
  readonly onSelectItem?: (text: string) => void;
};

type ContextActionItem = {
  id: string;
  label: string;
  group: string;
  icon: JSX.Element;
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
}: ChatContextActionsProperties): JSX.Element {
  const kernelError = useSelector(cadActor, (state) => state.context.kernelError);
  const codeErrors = useSelector(cadActor, (state) => state.context.codeErrors);
  const code = useSelector(cadActor, (state) => state.context.code);
  const isScreenshotReady = useSelector(graphicsActor, (state) => state.context.isScreenshotReady);

  // Create screenshot request machine instance
  const screenshotActorRef = useActorRef(screenshotRequestMachine, {
    input: { graphicsRef: graphicsActor },
  });

  const handleAddModelScreenshot = useCallback(() => {
    if (asPopoverMenu) {
      onClose?.();
    }

    console.time('modelScreenshot');
    console.log('Starting model screenshot capture...');

    // Use the screenshot machine for simplified request handling
    screenshotActorRef.send({
      type: 'requestScreenshot',
      options: {
        output: {
          format: 'image/webp', // Use WebP for consistency and performance
          quality: 0.8, // Slightly higher quality for single screenshots
        },
        aspectRatio: 16 / 9, // Standard widescreen ratio for model shots
        maxResolution: 1200, // Good balance of quality and performance for single shots
        zoomLevel: 1.4, // Optimized zoom level
      },
      onSuccess(dataUrls) {
        console.timeEnd('modelScreenshot');
        const dataUrl = dataUrls[0];
        if (dataUrl) {
          console.log('Model screenshot completed successfully');
          addImage(dataUrl);
        } else {
          console.error('No screenshot data received');
          toast.error('Failed to capture model screenshot');
        }
      },
      onError(error) {
        console.timeEnd('modelScreenshot');
        console.error('Screenshot failed:', error);
        toast.error(`Screenshot failed: ${error}`);
      },
    });
  }, [addImage, asPopoverMenu, onClose, screenshotActorRef]);

  const handleAddAllViewsScreenshots = useCallback(() => {
    if (asPopoverMenu) {
      onClose?.();
    }

    // Use the screenshot machine for efficient multi-angle capture
    screenshotActorRef.send({
      type: 'requestCompositeScreenshot',
      options: {
        output: {
          format: 'image/webp', // Use PNG for transparent backgrounds
          quality: 0.75,
          isPreview: true,
        },
        cameraAngles: orthographicViews,
        aspectRatio: 1, // Square images for better grid layout
        maxResolution: 800, // Reduced from 1000 for faster generation
        zoomLevel: 1.2, // Slightly lower zoom for smaller images
        composite: {
          enabled: true,
          preferredRatio: { columns: 3, rows: 2 }, // Prefer 3x2 grid as requested
          showLabels: true,
          padding: 12, // Increase padding for better visual separation
          labelHeight: 24,
          backgroundColor: 'transparent',
          dividerColor: '#666666', // Dark dividers for visibility on transparent background
          dividerWidth: 1,
        },
      },
      onSuccess(dataUrls) {
        const compositeDataUrl = dataUrls[0];
        if (compositeDataUrl) {
          console.log('All views composite screenshot completed successfully');
          addImage(compositeDataUrl);
        } else {
          console.error('No composite screenshot data received');
          toast.error('Failed to capture all views screenshot');
        }
      },
      onError(error) {
        console.error('All views screenshot failed:', error);
        toast.error(`All views screenshot failed: ${error}`);
      },
    });
  }, [addImage, asPopoverMenu, onClose, screenshotActorRef]);

  const handleAddCode = useCallback(() => {
    const markdownCode = `
# Code
\`\`\`javascript
${code}
\`\`\`
    `;
    addText(markdownCode);
    if (asPopoverMenu) {
      onClose?.();
    }
  }, [addText, code, asPopoverMenu, onClose]);

  const handleAddCodeErrors = useCallback(() => {
    const errors = codeErrors.map((error) => `- (${error.startLineNumber}:${error.startColumn}): ${error.message}`);

    const markdownErrors = `
# Code errors
${errors.join('\n')}
`;
    addText(markdownErrors);
    if (asPopoverMenu) {
      onClose?.();
    }
  }, [addText, codeErrors, asPopoverMenu, onClose]);

  const handleAddKernelError = useCallback(() => {
    if (kernelError) {
      const markdownKernelError = `
# Kernel error
${kernelError}
`;
      addText(markdownKernelError);
      if (asPopoverMenu) {
        onClose?.();
      }
    }
  }, [addText, kernelError, asPopoverMenu, onClose]);

  const contextItems = useMemo(
    (): ContextActionItem[] => [
      {
        id: 'add-model-screenshot',
        label: 'Model screenshot',
        group: 'Visual',
        icon: <Image className="mr-2 size-4" />,
        action: handleAddModelScreenshot,
        disabled: !isScreenshotReady,
      },
      {
        id: 'add-all-views-screenshots',
        label: 'All views screenshots',
        group: 'Visual',
        icon: <Camera className="mr-2 size-4" />,
        action: handleAddAllViewsScreenshots,
        disabled: !isScreenshotReady,
      },
      {
        id: 'add-code',
        label: 'Code',
        group: 'Code',
        icon: <Code className="mr-2 size-4" />,
        action: handleAddCode,
        disabled: !code,
      },
      {
        id: 'add-code-errors',
        label: 'Code errors',
        group: 'Code',
        icon: <AlertTriangle className="mr-2 size-4" />,
        action: handleAddCodeErrors,
        disabled: codeErrors.length === 0,
      },
      {
        id: 'add-kernel-error',
        label: 'Kernel error',
        group: 'Code',
        icon: <AlertCircle className="mr-2 size-4" />,
        action: handleAddKernelError,
        disabled: kernelError === undefined,
      },
    ],
    [
      handleAddModelScreenshot,
      isScreenshotReady,
      handleAddAllViewsScreenshots,
      handleAddCode,
      code,
      handleAddCodeErrors,
      codeErrors.length,
      handleAddKernelError,
      kernelError,
    ],
  );

  const groupedContextItems = useMemo(() => {
    const groupedContextItemsMap: Record<string, { name: string; items: ContextActionItem[] }> = {};
    const groupOrder: string[] = [];

    for (const item of contextItems) {
      if (!groupedContextItemsMap[item.group]) {
        groupedContextItemsMap[item.group] = { name: item.group, items: [] };
        groupOrder.push(item.group);
      }

      groupedContextItemsMap[item.group].items.push(item);
    }

    return Object.values(groupedContextItemsMap).sort(
      (a, b) => groupOrder.indexOf(a.name) - groupOrder.indexOf(b.name),
    );
  }, [contextItems]);

  const renderContextItemLabel = (item: ContextActionItem, _selectedItem: ContextActionItem | undefined) => (
    <div className="flex items-center">
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
      if (!asPopoverMenu || selectedIndex === undefined || !onSelectedIndexChange) return;

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
      <div className="max-h-64 overflow-y-auto">
        {filteredGroupedItems.map((group) => (
          <div key={group.name}>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group.name}</div>
            {group.items.map((item) => {
              const isSelected = selectedIndex === currentFlatIndex && !item.disabled;
              const itemFlatIndex = currentFlatIndex;
              if (!item.disabled) {
                currentFlatIndex++;
              }

              return (
                <button
                  key={item.id}
                  type="button"
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
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">No results found</div>
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
        defaultValue={undefined}
        isDisabled={isContextItemDisabled}
        popoverProperties={{
          align: 'start',
          side: 'top',
        }}
        popoverContentClassName="w-60 z-50"
        searchPlaceHolder="Search context..."
        placeholder="Add context"
        onSelect={(itemId) => {
          const selectedItem = contextItems.find((item) => item.id === itemId);
          selectedItem?.action();
        }}
      >
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="size-6 bg-background">
            <AtSign className="size-3" />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>Add context</TooltipContent>
    </Tooltip>
  );
}
