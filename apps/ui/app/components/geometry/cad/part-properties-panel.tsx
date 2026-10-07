import { useCallback, useMemo, useState } from 'react';
import { PaneVirtualList } from '#components/panes/pane-virtual-list.js';
import { Box, ChevronDown, CircleAlert, CircleHelp, LoaderCircle } from 'lucide-react';
import type { GeometryComponentNode } from '@taucad/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { appearanceLabel, statusOf, volumeLabel, weightLabel } from '#components/geometry/cad/part-quantities.js';
import type { PartQuantity } from '#components/geometry/cad/part-quantities.js';
import { DetailsToggle, disclosureMotion } from '#components/revisions/revision-actions.js';
import { PartPreviewFrame } from '#components/geometry/cad/part-preview-image.js';
import type { PartThumbnailState } from '#services/part-thumbnail.service.js';

type PartPropertiesPanelProps = {
  readonly node?: GeometryComponentNode;
  readonly entryPath?: string;
  readonly quantity?: PartQuantity;
  readonly preview?: PartThumbnailState;
  readonly onRetryPreview?: () => void;
  readonly onPreviewDecodeError?: () => void;
  readonly onPreviewDecoded?: () => void;
  /** Opens the part gallery from the identity frame. */
  readonly onOpenPreview?: (origin: HTMLElement) => void;
  /** Hide the identity row where a surrounding header already names the part. */
  readonly isIdentityHidden?: boolean;
};

function Fact({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 text-right wrap-break-word @max-[14rem]/properties:mb-2 @max-[14rem]/properties:text-left'>
        {value}
      </dd>
    </>
  );
}

function textureLabel(
  textures: NonNullable<NonNullable<GeometryComponentNode['appearance']>['materials']>[number]['textures'],
): string {
  if (!textures) {
    return 'None specified';
  }
  return (
    Object.entries(textures)
      .map(([slot, reference]) => {
        const { index } = reference;
        return typeof index === 'number' ? `${slot}: source texture index ${index}` : `${slot}: source reference`;
      })
      .join(', ') || 'None specified'
  );
}

export function PartPropertiesPanel({
  node,
  entryPath,
  quantity = {},
  preview,
  onRetryPreview,
  onPreviewDecodeError,
  onPreviewDecoded,
  onOpenPreview,
  isIdentityHidden = false,
}: PartPropertiesPanelProps): React.JSX.Element {
  if (!node) {
    return <PanelEmptyState icon={Box} title='No part selected' className='min-h-40' />;
  }

  const materials = node.appearance?.materials ?? [];
  const status = statusOf(quantity);
  return (
    <div data-slot='part-properties' className='@container/properties space-y-3 p-3 text-sm'>
      {isIdentityHidden ? undefined : (
        <div className='flex items-center gap-3'>
          <PartPreviewFrame
            name={node.name}
            preview={preview}
            className='size-20'
            fallback={
              materials.length > 0 ? (
                <MaterialSwatch materials={materials} />
              ) : (
                <Box aria-hidden='true' className='size-4' />
              )
            }
            onOpen={onOpenPreview}
            onDecodeError={onPreviewDecodeError}
            onDecoded={onPreviewDecoded}
          />
          <div className='min-w-0'>
            <div className='truncate font-medium'>{node.name}</div>
            <div className='truncate text-xs text-muted-foreground'>
              {node.kind} · {entryPath ?? 'Current model'}
            </div>
          </div>
        </div>
      )}

      {preview?.status === 'pending' || preview?.status === 'failed' ? (
        <div
          role={preview.status === 'failed' ? 'alert' : 'status'}
          aria-label='Preview status'
          aria-busy={preview.status === 'pending' || undefined}
          className='flex items-center justify-between gap-2 text-xs text-muted-foreground'
        >
          <span className='flex items-center gap-1.5'>
            {preview.status === 'pending' ? (
              <LoaderCircle aria-hidden='true' className='size-3.5 motion-safe:animate-spin' />
            ) : (
              <CircleAlert aria-hidden='true' className='size-3.5' />
            )}
            {preview.status === 'pending' ? 'Preview loading' : 'Preview unavailable'}
          </span>
          {preview.status === 'failed' && onRetryPreview ? (
            <button type='button' className='rounded-sm underline focus-visible:focus-outline' onClick={onRetryPreview}>
              Retry preview
            </button>
          ) : undefined}
        </div>
      ) : undefined}

      <section aria-label='Appearance'>
        <h3 className='mb-1 text-xs font-medium text-muted-foreground'>Appearance</h3>
        {materials.length > 0 ? (
          <AppearanceMaterials key={node.id} materials={materials} />
        ) : (
          <p className='text-xs text-muted-foreground'>{appearanceLabel(node)}</p>
        )}
      </section>

      <section aria-label='Physical facts'>
        <h3 className='mb-1 text-xs font-medium text-muted-foreground'>Physical facts</h3>
        <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs @max-[14rem]/properties:grid-cols-1'>
          <Fact label='Material' value='Not specified' />
          <Fact label='Density' value='Unknown' />
          <Fact label='Volume' value={volumeLabel(quantity)} />
          <Fact label='Weight' value={weightLabel(quantity)} />
        </dl>
      </section>

      <Collapsible>
        <div className='flex min-w-0 items-center justify-between gap-2'>
          <p
            role={status.kind === 'failed' ? 'alert' : 'status'}
            aria-label='Measurement status'
            className={cn('min-w-0 truncate text-xs text-muted-foreground', status.kind === 'failed' && 'text-feature')}
          >
            <CircleHelp aria-hidden='true' className='mr-1 inline size-3.5' />
            {status.sentence}
          </p>
          <DetailsToggle />
        </div>
        <CollapsibleContent className={disclosureMotion}>
          <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pt-2 text-xs @max-[14rem]/properties:grid-cols-1'>
            <Fact label='Volume method' value='Not measured' />
            <Fact label='Density source' value='Not supplied; a finish is not a material' />
            <Fact label='Basis' value='Source geometry; physical basis unverified' />
            <Fact
              label='Scope'
              value={
                node.kind === 'part'
                  ? 'Selected part; physical scope unverified'
                  : 'Selected group; physical scope unverified'
              }
            />
            <Fact label='Excludes' value='Coatings, hardware, tolerances' />
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type AppearanceMaterial = NonNullable<NonNullable<GeometryComponentNode['appearance']>['materials']>[number];
type AppearanceRow = { readonly material: AppearanceMaterial; readonly key: string };
const appearanceKey = (row: AppearanceRow): string => row.key;

function AppearanceMaterials({ materials }: { readonly materials: readonly AppearanceMaterial[] }): React.JSX.Element {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const data = useMemo(
    () =>
      materials.map((material, ordinal) => ({ material, key: `${material.materialIndex ?? 'default'}-${ordinal}` })),
    [materials],
  );
  const renderMaterial = useCallback(
    (_index: number, { material, key }: AppearanceRow) => (
      <Collapsible
        open={open.has(key)}
        onOpenChange={(isOpen) => {
          setOpen((current) => {
            const next = new Set(current);
            if (isOpen) {
              next.add(key);
            } else {
              next.delete(key);
            }
            return next;
          });
        }}
      >
        <CollapsibleTrigger className='flex min-h-7 w-full items-center gap-2 rounded-sm text-left focus-visible:focus-outline'>
          <MaterialSwatch materials={[material]} />
          <span className='min-w-0 flex-1 truncate'>
            {typeof material.name === 'string' && material.name.trim() ? material.name : 'Unnamed material'}
          </span>
          {material.extensions && Object.keys(material.extensions).length > 0 ? (
            <span className='truncate text-xs text-muted-foreground'>· extensions</span>
          ) : undefined}
          <ChevronDown aria-hidden='true' className='size-3.5 shrink-0 text-muted-foreground' />
        </CollapsibleTrigger>
        <CollapsibleContent className={disclosureMotion}>
          <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-2 pl-6 text-xs @max-[14rem]/properties:grid-cols-1 @max-[14rem]/properties:pl-0'>
            <Fact label='Base color' value={String(material.color ?? 'glTF default')} />
            <Fact label='Texture' value={textureLabel(material.textures)} />
            <Fact label='Metalness' value={String(material.metalness ?? 'glTF default')} />
            <Fact label='Roughness' value={String(material.roughness ?? 'glTF default')} />
            <Fact
              label='Extensions'
              value={material.extensions ? Object.keys(material.extensions).join(', ') || 'None' : 'None'}
            />
            <Fact
              label='Source'
              value={
                material.materialIndex === undefined
                  ? 'Default glTF material'
                  : `Material ${material.materialIndex + 1} of the source file; before selection and opacity overrides`
              }
            />
          </dl>
        </CollapsibleContent>
      </Collapsible>
    ),
    [open],
  );
  return (
    <PaneVirtualList
      data={data}
      getItemKey={appearanceKey}
      itemContent={renderMaterial}
      ariaLabel='Appearance materials'
    />
  );
}
