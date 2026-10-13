import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { cadReferenceTokenLabel } from '@taucad/chat/references';
import type { CadReferenceTokenTarget } from '@taucad/chat/references';
import { ContextChip } from '#components/chat/context-chip.js';
import { useProject } from '#hooks/use-project.js';

/** Model-interaction units of a source file are keyed `file:<entryPath>` (`model-interaction.machine.ts`). */
const unitIdOf = (path: string): string => `file:${path}`;

/**
 * A `@cad[<file>#<component>]` reference in the transcript. While the viewer shows that file and the component is in
 * its model tree, the chip is a button that selects the component there (the agent's highlight, source `chat`).
 * Selection is transient, so nothing reaches the workbench records.
 */
export function CadReferenceChip({ target }: { readonly target: CadReferenceTokenTarget }): React.JSX.Element {
  const modelInteractionRef = useProject({ enableNoContext: true })?.modelInteractionRef;
  const unitId = unitIdOf(target.path);
  const isShown = useSelector(
    modelInteractionRef,
    (state) => state?.context.unitsById[unitId]?.manifest?.nodesById[target.componentId] !== undefined,
  );
  const label = cadReferenceTokenLabel(target);
  const select = useCallback(() => {
    modelInteractionRef?.send({ type: 'selectComponent', unitId, componentId: target.componentId, source: 'chat' });
  }, [modelInteractionRef, target.componentId, unitId]);

  if (!isShown) {
    return <ContextChip label={label} chipType='geometry' tooltip={target.path} />;
  }
  return (
    <button type='button' className='inline align-middle' aria-label={`Select ${label} in the viewer`} onClick={select}>
      <ContextChip label={label} chipType='geometry' isInteractive tooltip={`Select in ${target.path}`} />
    </button>
  );
}
