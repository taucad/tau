import { useCallback, useMemo, useEffect } from 'react';
import { AtSign, Image, AlertTriangle, AlertCircle, Camera } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { CodeIssue } from '@taucad/types';
import type { KernelIssue } from '@taucad/runtime';
import { TooltipTrigger, TooltipContent, Tooltip } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { useProject, useMainGraphics } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { cn } from '#utils/ui.utils.js';
import { menuItemLayoutClass } from '#components/ui/menu.variants.js';
import type { DraftImageOptions } from '#hooks/use-chat.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { captureCadImages, captureFilesToDataUrls } from '#services/headless-capture.js';
import { useCameraRegistryVersion } from '#hooks/use-graphics.js';
import { getGraphicsCameraState, hasGraphicsCameraRig } from '#services/graphics-camera-registry.js';

type ChatContextActionsProperties = {
  readonly addImage: (image: string, options?: DraftImageOptions) => void;
  readonly addText: (text: string) => void;
  readonly isImageInputSupported?: boolean;
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
  isImageInputSupported = true,
  asPopoverMenu,
  onClose,
  searchQuery = '',
  selectedIndex,
  onSelectedIndexChange,
  onSelectItem,
  className,
  ...properties
}: ChatContextActionsProperties): React.JSX.Element {
  const { geometryUnits, mainEntryPath, viewGraphics, editorRef } = useProject();
  const mainGraphicsRef = useMainGraphics();
  const cadActor = geometryUnits.get(mainEntryPath);

  useCameraRegistryVersion();
  const mainCameraReady = hasGraphicsCameraRig(mainGraphicsRef);
  const mainGeometryFormat = useSelector(cadActor, (state) => state?.context.geometry?.format);
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);

  // Get the kernel error for the main entry path from its geometry unit
  const kernelIssue = useSelector(cadActor, (state) => {
    if (!state || !mainEntryPath) {
      return undefined;
    }

    return state.context.kernelIssues.get(mainEntryPath);
  });

  const codeIssues = useSelector(cadActor, (state) => state?.context.codeIssues ?? []);
  const imageService = useHeadlessImageService();
  const { runtimeFileSystem } = useFileManager();

  const capture = useCallback(
    async (
      targetCadRef: ActorRefFrom<typeof cadMachine> | undefined,
      graphicsRef: ActorRefFrom<typeof graphicsMachine> | undefined,
      mode: 'current' | 'orthographic',
    ) => {
      if (!targetCadRef) {
        toast.error('No CAD view available for image capture');
        return;
      }
      if (asPopoverMenu) {
        onClose?.();
      }
      try {
        const files = await captureCadImages({
          cadRef: targetCadRef,
          graphicsRef,
          cameraState: mode === 'current' ? getGraphicsCameraState(graphicsRef) : undefined,
          imageService,
          fileSystem: runtimeFileSystem,
          recipe: { purpose: 'chat', mode },
        });
        for (const dataUrl of captureFilesToDataUrls(files)) {
          addImage(dataUrl, { preserveOriginal: true });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Image capture failed');
      }
    },
    [addImage, asPopoverMenu, imageService, onClose, runtimeFileSystem],
  );

  const handleViewScreenshot = useCallback(
    (graphicsRef: ActorRefFrom<typeof graphicsMachine>, viewEntryPath: string | undefined) => {
      void capture(viewEntryPath ? geometryUnits.get(viewEntryPath) : undefined, graphicsRef, 'current');
    },
    [capture, geometryUnits],
  );

  const handleAddModelScreenshot = useCallback(() => {
    void capture(cadActor, mainGraphicsRef, 'current');
  }, [cadActor, capture, mainGraphicsRef]);

  const handleAddAllViewsScreenshots = useCallback(() => {
    void capture(cadActor, mainGraphicsRef, 'orthographic');
  }, [cadActor, capture, mainGraphicsRef]);

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
    const items: ContextActionItem[] = isImageInputSupported
      ? [
          {
            id: 'add-current-view-screenshot',
            label: 'Current view',
            group: 'Screenshot',
            icon: <Image />,
            action: handleAddModelScreenshot,
            disabled:
              !mainGeometryFormat ||
              mainGeometryFormat === 'webrtc' ||
              (mainGeometryFormat === 'gltf' && !mainCameraReady),
          },
          {
            id: 'add-all-views-screenshots',
            label: 'Orthographic views x 6',
            group: 'Screenshot',
            icon: <Camera />,
            action: handleAddAllViewsScreenshots,
            disabled: mainGeometryFormat !== 'gltf',
          },
        ]
      : [];

    // Add per-view screenshot items for non-main views when there are 2+ views
    if (isImageInputSupported && viewGraphics.size >= 2) {
      for (const [viewId, graphicsRef] of viewGraphics) {
        const settings = viewSettings[viewId];
        // Skip the main entry path view (already covered by "Current view screenshot")
        if (settings?.entryPath === mainEntryPath) {
          continue;
        }

        const fileName = settings?.entryPath?.split('/').pop() ?? 'Untitled';
        const viewCadRef = settings?.entryPath ? geometryUnits.get(settings.entryPath) : undefined;
        const format = viewCadRef?.getSnapshot().context.geometry?.format;
        items.push({
          id: `view-screenshot-${viewId}`,
          label: fileName,
          group: 'View Screenshots',
          icon: <Image />,
          action() {
            handleViewScreenshot(graphicsRef, settings?.entryPath);
          },
          disabled: !format || format === 'webrtc' || (format === 'gltf' && !hasGraphicsCameraRig(graphicsRef)),
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
    isImageInputSupported,
    mainCameraReady,
    mainGeometryFormat,
    handleAddAllViewsScreenshots,
    handleAddCodeIssues,
    codeIssues.length,
    handleAddKernelIssue,
    kernelIssue,
    viewGraphics,
    viewSettings,
    mainEntryPath,
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
