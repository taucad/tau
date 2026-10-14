import { useSelector } from '@xstate/react';
import { Boxes, Eye, EyeOff } from 'lucide-react';
import React, { useMemo } from 'react';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { cn } from '@taucad/ui/utils/cn';
import type { GeometryComponentNode } from '@taucad/types';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionRef } from '#machines/graphics.machine.js';

type StructureSectionProps = {
  /** The view's model interaction actor. */
  readonly modelInteractionRef: ModelInteractionRef;
  /** The unit the view shows, if any. */
  readonly unitId: string | undefined;
  readonly className?: string;
};

/**
 * The shown model's component tree without the app's pane chrome (agent plugin UI blueprint W10): a click selects a
 * component, Ctrl or Cmd adds it to the selection, and the eye hides or shows it.
 *
 * @param props - The interaction actor and the unit it shows.
 * @returns The tree, or an empty state while no model has components.
 * @public
 */
export function StructureSection({ modelInteractionRef, unitId, className }: StructureSectionProps): React.JSX.Element {
  const unit = useSelector(modelInteractionRef, (state) =>
    unitId === undefined ? undefined : getModelInteractionUnitState(state.context, unitId),
  );
  const rows = useMemo((): readonly GeometryComponentNode[] => {
    const manifest = unit?.manifest;
    if (manifest === undefined) {
      return [];
    }
    /* The root names the file; its children are the model's components. */
    return manifest.nodeOrder
      .map((id) => manifest.nodesById[id])
      .filter((node): node is GeometryComponentNode => node !== undefined && node.id !== manifest.rootId);
  }, [unit?.manifest]);

  if (unitId === undefined || rows.length === 0) {
    return <PanelEmptyState icon={Boxes} title='No components' className={cn('min-h-24', className)} />;
  }
  const rootDepth = Math.min(...rows.map((node) => node.depth));
  const selected = new Set(unit?.selectedComponentIds);
  const hidden = new Set(unit?.hiddenComponentIds);

  return (
    <ul className={cn('flex flex-col py-1', className)} aria-label='Components'>
      {rows.map((node) => {
        const isHidden = hidden.has(node.id);
        return (
          <li key={node.id} className='group/row flex items-center gap-1 pr-1'>
            <button
              type='button'
              aria-pressed={selected.has(node.id)}
              className={cn(
                'flex min-h-7 min-w-0 flex-1 items-center rounded-sm px-2 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected.has(node.id) && 'bg-accent font-medium',
                isHidden && 'text-muted-foreground',
              )}
              style={{ paddingLeft: `${String(0.5 + (node.depth - rootDepth) * 0.75)}rem` }}
              onClick={(event) => {
                modelInteractionRef.send({
                  type: event.metaKey || event.ctrlKey ? 'toggleComponentSelection' : 'selectComponent',
                  unitId,
                  componentId: node.id,
                  source: 'explorer',
                });
              }}
            >
              <span className='truncate'>{node.name}</span>
            </button>
            {node.capabilities.canHide ? (
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`${isHidden ? 'Show' : 'Hide'} ${node.name}`}
                className={cn(!isHidden && 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
                onClick={() => {
                  modelInteractionRef.send({
                    type: isHidden ? 'showComponent' : 'hideComponent',
                    unitId,
                    componentId: node.id,
                    source: 'explorer',
                  });
                }}
              >
                {isHidden ? <EyeOff className='size-3.5' /> : <Eye className='size-3.5' />}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
