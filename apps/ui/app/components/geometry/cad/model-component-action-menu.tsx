import {
  AtSign,
  Eye,
  EyeOff,
  FileBox,
  Focus,
  EllipsisVertical,
  Maximize2,
  Rotate3d,
  RotateCcw,
  Target,
} from 'lucide-react';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@taucad/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { ModelInteractionSource } from '@taucad/viewer/machines/model-interaction.machine';
import {
  ContextMenuSliderItem,
  DropdownMenuSliderItem,
  MenuSliderItem,
  preventMenuSliderEscapeDismissal,
} from '@taucad/ui/components/menu-slider-item';
import {
  ContextMenuDisclosureItem,
  DropdownMenuDisclosureItem,
  MenuDisclosureItem,
} from '@taucad/ui/components/menu-disclosure-item';
import type { MenuDisclosureItemProperties } from '@taucad/ui/components/menu-disclosure-item';
import { menuItemVariants, menuSeparatorVariants } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch, gltfDefaultBaseColorLabel } from '@taucad/viewer/cad/material-swatch';
import { appearanceLabel, statusOf, summaryLabel, volumeLabel, weightLabel } from '@taucad/viewer/cad/part-quantities';
import type { PartQuantity } from '@taucad/viewer/cad/part-quantities';
import { isPreviewablePart, useOpenPartGallery } from '#components/geometry/cad/part-gallery.js';
import {
  findModelComponentKinematicsTarget,
  useModelComponentActions,
} from '#components/geometry/cad/model-component-actions.js';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

export type ModelComponentActionMenuSource = Extract<ModelInteractionSource, 'explorer' | 'viewer'>;

export type ModelComponentActionMenuData = {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly graphicsRef: GraphicsActorRef;
  readonly unitId: string;
  readonly source: ModelComponentActionMenuSource;
  readonly isFocused: boolean;
  readonly isIsolated: boolean;
  readonly hasHiddenComponents: boolean;
  readonly hasOpacityOverrides: boolean;
  readonly opacity: number;
  readonly quantity?: PartQuantity;
  readonly preview?: PartThumbnailState;
  readonly onRetryPreview?: () => void;
  readonly onPreviewDecodeError?: () => void;
  readonly onPreviewDecoded?: () => void;
};

type ModelComponentActionDropdownProperties = ModelComponentActionMenuData & {
  readonly actionButtonClassName: string;
};

type ModelComponentActionContextContentProperties = ModelComponentActionMenuData & {
  readonly className?: string;
};

type ModelComponentActionDescriptor =
  | {
      readonly type: 'item';
      readonly id:
        | 'openPreview'
        | 'focus'
        | 'addToChat'
        | 'revealInExplorer'
        | 'showKinematics'
        | 'hide'
        | 'isolate'
        | 'showAll'
        | 'resetOpacity'
        | 'retryPreview';
      readonly label: string;
      readonly icon: React.ReactNode;
      readonly isDisabled?: boolean;
      readonly onSelect: () => void;
    }
  | { readonly type: 'separator'; readonly id: 'primary' | 'visibility' }
  | {
      readonly type: 'slider';
      readonly id: 'opacity';
      readonly label: string;
      readonly icon: React.ReactNode;
      readonly value: number;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly trailingAdornment: string;
      readonly onValueChange: (value: number) => void;
    };

type ModelComponentActionItemDescriptor = Extract<ModelComponentActionDescriptor, { readonly type: 'item' }>;

type ViewerModelComponentActionItemProperties = {
  readonly descriptor: ModelComponentActionItemDescriptor;
  readonly onRequestClose: () => void;
};

export function ModelComponentActionDropdown({
  actionButtonClassName,
  ...data
}: ModelComponentActionDropdownProperties): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          tabIndex={data.source === 'explorer' ? -1 : undefined}
          className={actionButtonClassName}
          aria-label={`Actions for ${data.node.name}`}
        >
          <EllipsisVertical className='size-3.5' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side='right'
        align='start'
        className='min-w-56'
        onEscapeKeyDown={preventMenuSliderEscapeDismissal}
      >
        <ModelComponentDropdownItems {...data} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ModelComponentActionContextContent({
  className,
  ...data
}: ModelComponentActionContextContentProperties): React.JSX.Element {
  return (
    <ContextMenuContent className={className ?? 'min-w-56'} onEscapeKeyDown={preventMenuSliderEscapeDismissal}>
      <ModelComponentContextMenuItems {...data} />
    </ContextMenuContent>
  );
}

function ModelComponentDropdownItems(data: ModelComponentActionMenuData): React.JSX.Element {
  const descriptors = useModelComponentActionDescriptors(data);

  return (
    <>
      <ModelComponentMenuHeader node={data.node} quantity={data.quantity} Row={DropdownMenuDisclosureItem} />
      {descriptors.map((descriptor) => renderDropdownActionDescriptor(descriptor))}
    </>
  );
}

function ModelComponentContextMenuItems(data: ModelComponentActionMenuData): React.JSX.Element {
  const descriptors = useModelComponentActionDescriptors(data);

  return (
    <>
      <ModelComponentMenuHeader node={data.node} quantity={data.quantity} Row={ContextMenuDisclosureItem} />
      {descriptors.map((descriptor) => renderContextActionDescriptor(descriptor))}
    </>
  );
}

export function ModelComponentViewerMenuItems({
  onRequestClose,
  ...data
}: ModelComponentActionMenuData & { readonly onRequestClose: () => void }): React.JSX.Element {
  const descriptors = useModelComponentActionDescriptors(data);

  return (
    <>
      <ModelComponentMenuHeader node={data.node} quantity={data.quantity} Row={MenuDisclosureItem} />
      {descriptors.map((descriptor) => renderViewerActionDescriptor(descriptor, onRequestClose))}
    </>
  );
}

type SurfaceMaterials = NonNullable<GeometryComponentAppearance['materials']>;
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- This text reports the glTF format's material default; it is not a UI palette or style.

function formatMaterialValues(materials: SurfaceMaterials, factor: 'color' | 'metalness' | 'roughness'): string {
  const values = new Map<string, { explicit: number; defaulted: number }>();
  for (const material of materials) {
    const value = material[factor];
    const isUnused = factor !== 'color' && material.isUnlit;
    const label = isUnused
      ? 'Not used (unlit)'
      : value === 'unavailable'
        ? 'Unavailable'
        : String(value ?? (factor === 'color' ? gltfDefaultBaseColorLabel : 1));
    const counts = values.get(label) ?? { explicit: 0, defaulted: 0 };
    if (!isUnused && value === undefined) {
      counts.defaulted++;
    } else {
      counts.explicit++;
    }
    values.set(label, counts);
  }
  const labels = [...values].map(([value, counts]) => {
    if (counts.defaulted === 0) {
      return value;
    }
    return `${value} (${counts.explicit > 0 ? 'includes glTF default' : 'glTF default'})`;
  });
  return labels.length === 1 ? labels[0]! : `Mixed: ${labels.join(', ')}`;
}

/**
 * The menu opens on the part it acts on: a row with its name and a material swatch that discloses
 * the material factors, collapsed to keep the menu lean. The part's image lives in the gallery.
 */
function ModelComponentMenuHeader({
  node,
  quantity,
  Row,
}: {
  readonly node: GeometryComponentNode;
  readonly quantity?: PartQuantity;
  readonly Row: React.ComponentType<MenuDisclosureItemProperties>;
}): React.JSX.Element {
  const materials = node.appearance?.materials;
  const facts = quantity ?? {};
  return (
    <>
      <Row
        label={<span className='font-medium'>{node.name}</span>}
        description={summaryLabel(node, facts)}
        trailing={materials?.length ? <MaterialSwatch materials={materials} /> : undefined}
      >
        <ModelComponentMaterialSummary node={node} quantity={facts} Row={Row} />
      </Row>
      <div role='separator' className={menuSeparatorVariants()} />
    </>
  );
}

export function ModelComponentMaterialSummary({
  node,
  quantity = {},
  Row = MenuDisclosureItem,
}: {
  readonly node: GeometryComponentNode;
  readonly quantity?: PartQuantity;
  readonly Row?: React.ComponentType<MenuDisclosureItemProperties>;
}): React.JSX.Element {
  const materials = node.appearance?.materials;
  const status = statusOf(quantity);

  return (
    <div role='group' aria-label={`Inspection for ${node.name}`}>
      <dl className='space-y-1 px-3 pt-1 pb-2 text-xs text-foreground'>
        <div className='flex justify-between gap-4'>
          <dt className='text-muted-foreground'>Appearance</dt>
          <dd className='max-w-48 text-right'>{appearanceLabel(node)}</dd>
        </div>
        <div className='flex justify-between gap-4'>
          <dt className='text-muted-foreground'>Material</dt>
          <dd>Not specified</dd>
        </div>
        <div className='flex justify-between gap-4'>
          <dt className='text-muted-foreground'>Volume</dt>
          <dd className='font-mono tabular-nums'>{volumeLabel(quantity)}</dd>
        </div>
        <div className='flex justify-between gap-4'>
          <dt className='text-muted-foreground'>Weight</dt>
          <dd className='font-mono tabular-nums'>{weightLabel(quantity)}</dd>
        </div>
      </dl>
      <p
        role={status.kind === 'failed' ? 'alert' : 'status'}
        aria-label='Measurement status'
        className='px-3 pb-2 text-xs text-muted-foreground'
      >
        {status.sentence}
      </p>
      {materials?.length ? (
        <Row label='Rendering'>
          <dl className='space-y-1 px-3 pt-1 pb-2 text-xs text-foreground'>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Base color</dt>
              <dd className='max-w-48 text-right font-mono wrap-break-word tabular-nums'>
                {formatMaterialValues(materials, 'color')}
              </dd>
            </div>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Metalness</dt>
              <dd className='max-w-48 text-right font-mono wrap-break-word tabular-nums'>
                {formatMaterialValues(materials, 'metalness')}
              </dd>
            </div>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Roughness</dt>
              <dd className='max-w-48 text-right font-mono wrap-break-word tabular-nums'>
                {formatMaterialValues(materials, 'roughness')}
              </dd>
            </div>
          </dl>
        </Row>
      ) : undefined}
    </div>
  );
}

function useModelComponentActionDescriptors(
  data: ModelComponentActionMenuData,
): readonly ModelComponentActionDescriptor[] {
  const actions = useModelComponentActions(data);
  const openPartGallery = useOpenPartGallery();
  const opacityPercent = Math.round(data.opacity * 100);
  const openPreviewDescriptor: readonly ModelComponentActionDescriptor[] =
    openPartGallery && isPreviewablePart(data.node)
      ? [
          {
            type: 'item',
            id: 'openPreview',
            label: 'Open preview',
            icon: <Maximize2 className='size-3.5' />,
            onSelect: () => {
              openPartGallery({
                graphicsRef: data.graphicsRef,
                unitId: data.unitId,
                componentId: data.node.id,
                source: data.source,
                // Menu triggers are not focused on pointer open and re-render on selection, so focus
                // returns to the Explorer row's keyboard stop.
                origin:
                  data.source === 'explorer'
                    ? (document.querySelector<HTMLElement>(
                        `[data-model-part-button][data-model-component-id="${CSS.escape(data.node.id)}"]`,
                      ) ?? undefined)
                    : undefined,
              });
            },
          },
        ]
      : [];
  const revealInExplorerDescriptor: readonly ModelComponentActionDescriptor[] =
    data.source === 'viewer' && data.manifest.sourceFile
      ? [
          {
            type: 'item',
            id: 'revealInExplorer',
            label: 'Reveal in Explorer',
            icon: <FileBox className='size-3.5' />,
            onSelect: actions.revealInExplorer,
          },
        ]
      : [];
  const retryPreviewDescriptor: readonly ModelComponentActionDescriptor[] =
    data.preview?.status === 'failed' && data.onRetryPreview
      ? [
          {
            type: 'item',
            id: 'retryPreview',
            label: 'Retry preview',
            icon: <RotateCcw className='size-3.5' />,
            onSelect: data.onRetryPreview,
          },
        ]
      : [];

  return [
    ...openPreviewDescriptor,
    {
      type: 'item',
      id: 'focus',
      label: 'Focus on part',
      icon: <Focus className='size-3.5' />,
      isDisabled: data.isFocused,
      onSelect: actions.focusComponent,
    },
    {
      type: 'item',
      id: 'addToChat',
      label: 'Add to chat',
      icon: <AtSign className='size-3.5' />,
      onSelect: actions.addToChat,
    },
    ...revealInExplorerDescriptor,
    ...retryPreviewDescriptor,
    {
      type: 'item',
      id: 'showKinematics',
      label: 'Show kinematics',
      icon: <Rotate3d className='size-3.5' />,
      isDisabled: findModelComponentKinematicsTarget(data.manifest, data.node) === undefined,
      onSelect: actions.showKinematics,
    },
    { type: 'separator', id: 'primary' },
    {
      type: 'item',
      id: 'hide',
      label: 'Hide',
      icon: <EyeOff className='size-3.5' />,
      onSelect: actions.hideComponent,
    },
    {
      type: 'item',
      id: 'isolate',
      label: data.isIsolated ? 'Remove isolation' : 'Isolate',
      icon: <Target className='size-3.5' />,
      onSelect: actions.toggleIsolation,
    },
    {
      type: 'item',
      id: 'showAll',
      label: 'Show all',
      icon: <Eye className='size-3.5' />,
      isDisabled: !data.hasHiddenComponents,
      onSelect: actions.showAll,
    },
    { type: 'separator', id: 'visibility' },
    {
      type: 'slider',
      id: 'opacity',
      label: 'Opacity',
      icon: <Eye className='size-3.5' />,
      value: opacityPercent,
      min: 0,
      max: 100,
      step: 1,
      trailingAdornment: '%',
      onValueChange: actions.setOpacityPercent,
    },
    {
      type: 'item',
      id: 'resetOpacity',
      label: 'Reset opacity',
      icon: <RotateCcw className='size-3.5' />,
      isDisabled: !data.hasOpacityOverrides,
      onSelect: actions.resetAllOpacities,
    },
  ];
}

function renderDropdownActionDescriptor(descriptor: ModelComponentActionDescriptor): React.JSX.Element {
  if (descriptor.type === 'separator') {
    return <DropdownMenuSeparator key={descriptor.id} />;
  }

  if (descriptor.type === 'slider') {
    return (
      <DropdownMenuSliderItem
        key={descriptor.id}
        value={descriptor.value}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        trailingAdornment={descriptor.trailingAdornment}
        aria-label={descriptor.label}
        onValueChange={descriptor.onValueChange}
      >
        {descriptor.icon}
        {descriptor.label}
      </DropdownMenuSliderItem>
    );
  }

  return (
    <DropdownMenuItem key={descriptor.id} disabled={descriptor.isDisabled} onSelect={descriptor.onSelect}>
      {descriptor.icon}
      {descriptor.label}
    </DropdownMenuItem>
  );
}

function renderContextActionDescriptor(descriptor: ModelComponentActionDescriptor): React.JSX.Element {
  if (descriptor.type === 'separator') {
    return <ContextMenuSeparator key={descriptor.id} />;
  }

  if (descriptor.type === 'slider') {
    return (
      <ContextMenuSliderItem
        key={descriptor.id}
        value={descriptor.value}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        trailingAdornment={descriptor.trailingAdornment}
        aria-label={descriptor.label}
        onValueChange={descriptor.onValueChange}
      >
        {descriptor.icon}
        {descriptor.label}
      </ContextMenuSliderItem>
    );
  }

  return (
    <ContextMenuItem key={descriptor.id} disabled={descriptor.isDisabled} onSelect={descriptor.onSelect}>
      {descriptor.icon}
      {descriptor.label}
    </ContextMenuItem>
  );
}

function renderViewerActionDescriptor(
  descriptor: ModelComponentActionDescriptor,
  onRequestClose: () => void,
): React.JSX.Element {
  if (descriptor.type === 'separator') {
    return <div key={descriptor.id} role='separator' className={menuSeparatorVariants()} />;
  }

  if (descriptor.type === 'slider') {
    return (
      <MenuSliderItem
        key={descriptor.id}
        dataSlot='viewer-model-component-action-slider-item'
        value={descriptor.value}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        trailingAdornment={descriptor.trailingAdornment}
        aria-label={descriptor.label}
        onValueChange={descriptor.onValueChange}
      >
        {descriptor.icon}
        {descriptor.label}
      </MenuSliderItem>
    );
  }

  return <ViewerModelComponentActionItem key={descriptor.id} descriptor={descriptor} onRequestClose={onRequestClose} />;
}

function ViewerModelComponentActionItem({
  descriptor,
  onRequestClose,
}: ViewerModelComponentActionItemProperties): React.JSX.Element {
  const focusMenuItem = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (descriptor.isDisabled) {
      return;
    }
    event.currentTarget.focus({ preventScroll: true });
  };

  return (
    <button
      type='button'
      role='menuitem'
      disabled={descriptor.isDisabled}
      data-disabled={descriptor.isDisabled ? true : undefined}
      className={cn(menuItemVariants(), 'w-full')}
      onPointerEnter={focusMenuItem}
      onPointerMove={focusMenuItem}
      onClick={() => {
        descriptor.onSelect();
        onRequestClose();
      }}
    >
      {descriptor.icon}
      {descriptor.label}
    </button>
  );
}
