import { AtSign, Eye, EyeOff, FileBox, Focus, EllipsisVertical, RotateCcw, Target } from 'lucide-react';
import type { ActorRefFrom } from 'xstate';
import type {
  GeometryComponentAppearance,
  GeometryComponentManifest,
  GeometryComponentNode,
  GeometryComponentReference,
} from '@taucad/types';
import { geometryReferenceToToken, useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@taucad/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { ModelInteractionSource } from '#machines/model-interaction.machine.js';
import { useProject } from '#hooks/use-project.js';
import {
  ContextMenuSliderItem,
  DropdownMenuSliderItem,
  MenuSliderItem,
  preventMenuSliderEscapeDismissal,
} from '#components/ui/menu-slider-item.js';
import {
  ContextMenuDisclosureItem,
  DropdownMenuDisclosureItem,
  MenuDisclosureItem,
} from '#components/ui/menu-disclosure-item.js';
import type { MenuDisclosureItemProperties } from '#components/ui/menu-disclosure-item.js';
import { menuItemVariants, menuSeparatorVariants } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

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
};

type ModelComponentActionDropdownProperties = ModelComponentActionMenuData & {
  readonly actionButtonClassName: string;
};

type ModelComponentActionContextContentProperties = ModelComponentActionMenuData & {
  readonly className?: string;
};

type ModelComponentActions = {
  readonly addToChat: () => void;
  readonly revealInExplorer: () => void;
  readonly focusComponent: () => void;
  readonly hideComponent: () => void;
  readonly toggleIsolation: () => void;
  readonly showAll: () => void;
  readonly setOpacityPercent: (value: number) => void;
  readonly resetAllOpacities: () => void;
};

type ModelComponentActionDescriptor =
  | {
      readonly type: 'item';
      readonly id: 'focus' | 'addToChat' | 'revealInExplorer' | 'hide' | 'isolate' | 'showAll' | 'resetOpacity';
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
      readonly trailingAdornment: React.ReactNode;
      readonly onValueChange: (value: number) => void;
    };

type ModelComponentActionItemDescriptor = Extract<ModelComponentActionDescriptor, { readonly type: 'item' }>;

type ViewerModelComponentActionItemProperties = {
  readonly descriptor: ModelComponentActionItemDescriptor;
  readonly onRequestClose: () => void;
};

export function buildModelComponentGeometryReference(
  manifest: GeometryComponentManifest,
  node: GeometryComponentNode,
): GeometryComponentReference | undefined {
  if (node.reference) {
    return node.reference;
  }
  if (!manifest.sourceFile) {
    return undefined;
  }
  return {
    scheme: 'tau-cad',
    filePath: manifest.sourceFile,
    componentId: node.id,
    selector: node.selector,
    geometryHash: manifest.geometryHash,
    label: node.name,
    kind: node.kind,
  };
}

export function ModelComponentActionDropdown({
  actionButtonClassName,
  ...data
}: ModelComponentActionDropdownProperties): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type='button' className={actionButtonClassName} aria-label={`Actions for ${data.node.name}`}>
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
      <ModelComponentMenuHeader node={data.node} Row={DropdownMenuDisclosureItem} />
      {descriptors.map((descriptor) => renderDropdownActionDescriptor(descriptor))}
    </>
  );
}

function ModelComponentContextMenuItems(data: ModelComponentActionMenuData): React.JSX.Element {
  const descriptors = useModelComponentActionDescriptors(data);

  return (
    <>
      <ModelComponentMenuHeader node={data.node} Row={ContextMenuDisclosureItem} />
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
      <ModelComponentMenuHeader node={data.node} Row={MenuDisclosureItem} />
      {descriptors.map((descriptor) => renderViewerActionDescriptor(descriptor, onRequestClose))}
    </>
  );
}

type SurfaceMaterials = NonNullable<GeometryComponentAppearance['materials']>;
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- This text reports the glTF format's material default; it is not a UI palette or style.
const gltfDefaultBaseColorLabel = '#ffffff';

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

const numericFactor = (value: number | 'unavailable' | undefined): number => (typeof value === 'number' ? value : 1);

/**
 * A small lit sphere of a part's surface materials, so the menu row reads as that part at a glance:
 * the base colour (a pie of colours when the surfaces differ), a highlight that tightens as
 * roughness drops, and a darker rim as metalness rises.
 */
function MaterialSwatch({ materials }: { readonly materials: SurfaceMaterials }): React.JSX.Element {
  const colors = [
    ...new Set(
      materials.map(({ color }) =>
        color === undefined || color === 'unavailable' ? gltfDefaultBaseColorLabel : color,
      ),
    ),
  ];
  const fill =
    colors.length === 1
      ? colors[0]!
      : `conic-gradient(${colors.map((color, index) => `${color} ${(index * 100) / colors.length}% ${((index + 1) * 100) / colors.length}%`).join(', ')})`;
  const roughness = numericFactor(materials[0]?.roughness);
  const metalness = numericFactor(materials[0]?.metalness);
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Light and shadow on a rendered material preview, not UI palette colours.
  const highlight = `radial-gradient(circle at 32% 30%, rgb(255 255 255 / ${0.85 * (1 - roughness)}) 0, transparent ${35 + 35 * roughness}%)`;
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Light and shadow on a rendered material preview, not UI palette colours.
  const rim = `radial-gradient(circle, transparent 50%, rgb(0 0 0 / ${0.1 + 0.3 * metalness}) 100%)`;
  return (
    <span
      aria-hidden
      data-slot='material-swatch'
      className='size-3.5 shrink-0 rounded-full ring-1 ring-border'
      style={{ background: `${highlight}, ${rim}, ${fill}` }}
    />
  );
}

/**
 * The menu opens on the part it acts on: a row with its name and a material swatch that discloses
 * the material factors, collapsed to keep the menu lean.
 */
function ModelComponentMenuHeader({
  node,
  Row,
}: {
  readonly node: GeometryComponentNode;
  readonly Row: React.ComponentType<MenuDisclosureItemProperties>;
}): React.JSX.Element {
  const materials = node.appearance?.materials;
  return (
    <>
      {materials?.length ? (
        <Row label={node.name} trailing={<MaterialSwatch materials={materials} />}>
          <ModelComponentMaterialSummary node={node} />
        </Row>
      ) : (
        <Row label={node.name} />
      )}
      <div role='separator' className={menuSeparatorVariants()} />
    </>
  );
}

export function ModelComponentMaterialSummary({
  node,
}: {
  readonly node: GeometryComponentNode;
}): React.JSX.Element | undefined {
  const materials = node.appearance?.materials;
  if (!materials?.length) {
    return undefined;
  }

  return (
    <div role='group' aria-label={`Material for ${node.name}`}>
      <dl className='space-y-1 pt-1 pr-3 pb-2 pl-8.5 text-xs text-foreground'>
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
    </div>
  );
}

function useModelComponentActionDescriptors(
  data: ModelComponentActionMenuData,
): readonly ModelComponentActionDescriptor[] {
  const actions = useModelComponentActions(data);
  const opacityPercent = Math.round(data.opacity * 100);
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

  return [
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

function useModelComponentActions({
  manifest,
  node,
  graphicsRef,
  unitId,
  source,
  isIsolated,
}: ModelComponentActionMenuData): ModelComponentActions {
  const { addContextReferences } = useChatContextInsertion();
  const project = useProject({ enableNoContext: true });
  const workspace = useProjectWorkspace({ enableNoContext: true });

  return {
    addToChat: () => {
      const reference = buildModelComponentGeometryReference(manifest, node);
      if (!reference) {
        return;
      }
      addContextReferences([
        {
          id: `${reference.filePath}#${reference.componentId}`,
          label: reference.label,
          chipType: 'geometry',
          referenceToken: geometryReferenceToToken(reference),
          geometryReference: reference,
        },
      ]);
    },
    revealInExplorer: () => {
      if (source !== 'viewer' || !manifest.sourceFile || !project) {
        return;
      }
      graphicsRef.send({ type: 'selectModelComponent', unitId, componentId: node.id, source: 'viewer' });
      workspace?.openPanel('model');
      requestAnimationFrame(() => {
        project.editorRef.send({
          type: 'revealModelComponentInExplorer',
          entryPath: manifest.sourceFile!,
          unitId,
          componentId: node.id,
        });
      });
    },
    focusComponent: () => {
      graphicsRef.send({ type: 'focusModelComponent', unitId, componentId: node.id, source });
    },
    hideComponent: () => {
      graphicsRef.send({ type: 'hideModelComponent', unitId, componentId: node.id, source });
    },
    toggleIsolation: () => {
      graphicsRef.send(
        isIsolated
          ? { type: 'clearModelComponentIsolation', unitId, source }
          : { type: 'isolateModelComponent', unitId, componentId: node.id, source },
      );
    },
    showAll: () => {
      graphicsRef.send({ type: 'showHiddenModelComponents', unitId, source });
    },
    setOpacityPercent: (value) => {
      graphicsRef.send({
        type: 'setModelComponentOpacity',
        unitId,
        componentId: node.id,
        opacity: value / 100,
        source,
      });
    },
    resetAllOpacities: () => {
      graphicsRef.send({ type: 'resetModelComponentOpacities', unitId, source });
    },
  };
}
