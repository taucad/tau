import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProject } from '#hooks/use-project.js';

/**
 * The close of every live view's durable settings (R6; charter G6b).
 *
 * Each view's record session runs in the project machine beside its graphics actor: the owner of a durable field is
 * the actor that holds it, and those actors outlive the pane that happens to be showing them. The session holds the
 * view record's store, its watch and the view's `viewRecordBinding`, and publishes the record's issue itself. What is
 * left for React is the close: this host registers the sessions' flush as a workbench record producer and with the
 * unload guard, so a project whose window closes still writes what its owners hold.
 */
export function ViewSettingsSyncHost(): ReactNode {
  const { viewRecordPorts, registerWorkbenchRecordProducer } = useProject();
  useEffect(
    () => registerWorkbenchRecordProducer(viewRecordPorts.flush),
    [registerWorkbenchRecordProducer, viewRecordPorts],
  );
  useFlushOnClose(viewRecordPorts.flush, { stage: 'producer' });
  return null;
}
