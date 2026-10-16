import { memo } from 'react';
import { Box, Eye, EyeOff, Target } from 'lucide-react';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { ContextMenu, ContextMenuTrigger } from '@taucad/ui/components/context-menu';
import { HighlightText } from '@taucad/ui/components/highlight-text';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch } from '@taucad/viewer/cad/material-swatch';
import { PartPreviewFrame } from '@taucad/viewer/cad/part-preview-image';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import type { GraphicsRef } from '#host/workbench-host.jsx';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import { isPreviewablePart } from '#model/visible-components.js';

/**
 * The left inset of a component row at a tree depth.
 *
 * @internal
 * @returns The inset in pixels.
 */
export function getComponentRowPaddingLeft({
  depth,
  rootDepth,
}: {
  readonly depth: number;
  readonly rootDepth: number;
}): number {
  return 8 + Math.max(0, depth - rootDepth - 1) * 12;
}

function getVisibilityAction({
  isHidden,
  nodeName,
  unitId,
  componentId,
}: {
  readonly isHidden: boolean;
  readonly nodeName: string;
  readonly unitId: string;
  readonly componentId: string;
}) {
  if (isHidden) {
    return {
      Icon: EyeOff,
      ariaLabel: `Show ${nodeName}`,
      event: { type: 'showModelComponent', unitId, componentId, source: 'explorer' } as const,
      tooltip: 'Show part',
    };
  }

  return {
    Icon: Eye,
    ariaLabel: `Hide ${nodeName}`,
    event: { type: 'hideModelComponent', unitId, componentId, source: 'explorer' } as const,
    tooltip: 'Hide part',
  };
}

function getIsolationAction({
  isIsolated,
  nodeName,
  unitId,
  componentId,
}: {
  readonly isIsolated: boolean;
  readonly nodeName: string;
  readonly unitId: string;
  readonly componentId: string;
}) {
  if (isIsolated) {
    return {
      ariaLabel: `Remove isolation for ${nodeName}`,
      className: 'bg-muted-foreground/15 text-foreground',
      event: { type: 'clearModelComponentIsolation', unitId, source: 'explorer' } as const,
      pressed: true,
      tooltip: 'Remove isolation',
    };
  }

  return {
    ariaLabel: `Isolate ${nodeName}`,
    className: undefined,
    event: { type: 'isolateModelComponent', unitId, componentId, source: 'explorer' } as const,
    pressed: false,
    tooltip: 'Isolate part',
  };
}

/**
 * One component row of the Model tree: preview, name, visibility, isolation and the host's component menu.
 *
 * @internal
 */
// oxlint-disable-next-line complexity -- one row's lit, hover, preview and menu states, moved from the app as is
export const ComponentRow = memo(function ComponentRow({
  manifest,
  node,
  query = '',
  graphicsRef,
  unitId,
  rootDepth,
  hoveredComponentId,
  isSelected,
  isHidden,
  isIsolated,
  isFocused,
  hasHiddenComponents = false,
  hasOpacityOverrides = false,
  opacity,
  activeRowId,
  onRowFocus,
  preview,
  onRetryPreview,
  onPreviewDecodeError,
  onPreviewDecoded,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly query?: string;
  readonly graphicsRef: GraphicsRef;
  readonly unitId: string;
  readonly rootDepth: number;
  readonly hoveredComponentId: string | undefined;
  readonly isSelected: boolean;
  readonly isHidden: boolean;
  readonly isIsolated: boolean;
  readonly isFocused: boolean;
  readonly hasHiddenComponents?: boolean;
  readonly hasOpacityOverrides?: boolean;
  readonly opacity: number;
  readonly activeRowId?: string;
  readonly onRowFocus?: (id: string) => void;
  readonly preview?: PartThumbnailState;
  readonly onRetryPreview?: (id: string) => void;
  readonly onPreviewDecodeError?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
  readonly onPreviewDecoded?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
}): React.JSX.Element {
  const source = useWorkbenchPanesHost().model;
  const isHovered = hoveredComponentId === node.id;
  const normalizedQuery = query.trim().toLowerCase();
  const materialMatchName =
    normalizedQuery && !node.name.toLowerCase().includes(normalizedQuery)
      ? node.appearance?.materials?.find(
          (material) => typeof material.name === 'string' && material.name.toLowerCase().includes(normalizedQuery),
        )?.name
      : undefined;
  const visibilityAction = getVisibilityAction({ isHidden, nodeName: node.name, unitId, componentId: node.id });
  const isolationAction = getIsolationAction({ isIsolated, nodeName: node.name, unitId, componentId: node.id });
  const VisibilityIcon = visibilityAction.Icon;
  /* The sidebar row's action: 24 px with the nested-action tone (nested-action surfaces R5). */
  const actionButtonClassName = nestedActionVariants({
    className: cn(
      'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0',
      'focus-visible:bg-nested-action-hover focus-visible:text-foreground focus-visible:opacity-100 focus-visible:focus-outline',
      'group-hover/part:opacity-100 group-focus-within/part:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100',
      (isHovered || isIsolated) && 'opacity-100',
    ),
  });
  const guideCount = Math.max(0, node.depth - rootDepth - 1);
  const openPartGallery = source?.openPartGallery;
  const actions = source?.componentActions;
  /* Without a thumbnail renderer a part row stays compact. */
  const isPreviewRow = source?.useThumbnails !== undefined && isPreviewablePart(node);
  const swatch = node.appearance?.materials?.length ? (
    <MaterialSwatch materials={node.appearance.materials} />
  ) : (
    <Box
      aria-hidden='true'
      data-testid='component-color-icon'
      className='size-4 shrink-0'
      style={node.appearance?.color ? { fill: node.appearance.color } : undefined}
    />
  );

  const onHover = (componentId: string | undefined): void => {
    graphicsRef.send({ type: 'setHoveredModelComponent', unitId, componentId, source: 'explorer' });
  };
  const toggleSelection = (): void => {
    graphicsRef.send({
      type: 'toggleModelComponentSelection',
      unitId,
      componentId: node.id,
      source: 'explorer',
    });
  };
  const menuProps = {
    manifest,
    node,
    graphicsRef,
    unitId,
    source: 'explorer',
    isFocused,
    isIsolated,
    hasHiddenComponents,
    hasOpacityOverrides,
    opacity,
    preview,
    onRetryPreview: onRetryPreview
      ? () => {
          onRetryPreview(node.id);
        }
      : undefined,
    onPreviewDecodeError: preview?.bytes ? () => onPreviewDecodeError?.(node.id, preview.bytes!) : undefined,
    onPreviewDecoded: preview?.bytes ? () => onPreviewDecoded?.(node.id, preview.bytes!) : undefined,
  } as const;

  const row = (
    <div
      data-model-component-row=''
      data-model-component-unit-id={unitId}
      data-model-component-id={node.id}
      className={cn(
        // The sidebar row's lit states and inset: `pr-0.5` gives a 24 px action the 2 px it has above and below.
        'group/part relative flex w-full items-center justify-between rounded-md py-1 pr-0.5 pl-2 text-sm leading-5',
        // A part row leads with its 80 px preview; groups stay compact.
        isPreviewRow ? 'h-22 gap-2' : 'h-7',
        'focus-within:bg-sidebar-accent focus-within:text-sidebar-accent-foreground has-[[aria-haspopup=menu][data-state=open]]:bg-sidebar-accent',
        isSelected ? 'bg-primary/10 text-foreground' : 'text-sidebar-foreground',
        !isSelected && isFocused ? 'bg-sidebar-accent/70 text-foreground ring-1 ring-inset ring-primary/30' : undefined,
        !isSelected && !isFocused && isIsolated ? 'text-primary' : undefined,
        !isSelected && !isFocused ? 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground' : undefined,
        isHovered && !isSelected ? 'text-foreground' : undefined,
        isHidden ? 'opacity-45' : undefined,
      )}
      style={{ paddingLeft: `${getComponentRowPaddingLeft({ depth: node.depth, rootDepth })}px` }}
      onMouseEnter={() => {
        onHover(node.id);
      }}
      onMouseLeave={() => {
        onHover(undefined);
      }}
    >
      {Array.from({ length: guideCount }, (_, depth) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- each position represents a stable ancestor depth
          key={depth}
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute inset-y-0 w-px bg-border/60 group-hover/part:opacity-100 group-focus-within/part:opacity-100',
            isSelected || isFocused ? 'opacity-100' : 'opacity-45',
          )}
          style={{ left: `${8 + depth * 12}px` }}
        />
      ))}
      {isPreviewRow ? (
        <PartPreviewFrame
          name={node.name}
          preview={preview}
          className='size-20'
          fallback={swatch}
          tabIndex={-1}
          onOpen={
            openPartGallery
              ? (origin) => {
                  openPartGallery({ graphicsRef, unitId, componentId: node.id, source: 'explorer', origin });
                }
              : undefined
          }
          onDecodeError={preview?.bytes ? () => onPreviewDecodeError?.(node.id, preview.bytes!) : undefined}
          onDecoded={preview?.bytes ? () => onPreviewDecoded?.(node.id, preview.bytes!) : undefined}
        />
      ) : undefined}
      <button
        type='button'
        data-model-part-button=''
        data-model-component-id={node.id}
        tabIndex={activeRowId === undefined || activeRowId === node.id ? 0 : -1}
        className='flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:focus-outline'
        aria-label={node.name}
        aria-pressed={isSelected}
        aria-busy={preview?.status === 'pending' || undefined}
        onClick={toggleSelection}
        onFocus={() => {
          onRowFocus?.(node.id);
        }}
        onKeyDown={(event) => {
          if (event.shiftKey && event.key === 'F10') {
            event.preventDefault();
            const rowElement = event.currentTarget.closest('[data-model-component-row]');
            if (rowElement) {
              const bounds = rowElement.getBoundingClientRect();
              rowElement.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: bounds.left + bounds.width / 2,
                  clientY: bounds.bottom,
                }),
              );
            }
          }
        }}
      >
        {isPreviewRow ? undefined : swatch}
        <span className='truncate'>
          <HighlightText text={node.name} searchTerm={query} />
        </span>
        {preview?.status === 'pending' || preview?.status === 'failed' ? (
          <span className='sr-only'>Preview {preview.status === 'pending' ? 'loading' : 'unavailable'}</span>
        ) : undefined}
        {materialMatchName ? (
          <span className='truncate text-xs text-muted-foreground'>· {materialMatchName}</span>
        ) : undefined}
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type='button'
            tabIndex={-1}
            className={actionButtonClassName}
            aria-label={visibilityAction.ariaLabel}
            onClick={() => {
              graphicsRef.send(visibilityAction.event);
            }}
          >
            <VisibilityIcon className='size-3.5' />
          </button>
        </TooltipTrigger>
        <TooltipContent>{visibilityAction.tooltip}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type='button'
            tabIndex={-1}
            className={cn(actionButtonClassName, isolationAction.className)}
            aria-label={isolationAction.ariaLabel}
            aria-pressed={isolationAction.pressed}
            onClick={() => {
              graphicsRef.send(isolationAction.event);
            }}
          >
            <Target className='size-3.5' />
          </button>
        </TooltipTrigger>
        <TooltipContent>{isolationAction.tooltip}</TooltipContent>
      </Tooltip>
      {actions ? <actions.Dropdown {...menuProps} actionButtonClassName={actionButtonClassName} /> : undefined}
    </div>
  );

  if (!actions) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <actions.ContextContent {...menuProps} />
    </ContextMenu>
  );
});
