import { useCallback, useSyncExternalStore } from 'react';
import { MonitorSmartphone, Repeat } from 'lucide-react';
import type { CadAgentExecution } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useModels } from '#hooks/use-models.js';
import {
  externalAgentDisplayName,
  heldPlacementReason,
  isDeviceRelativeHostReachable,
  onLoopbackAgentHostsChanged,
  unplaceableExecutionReason,
} from '#lib/agent-host-placement.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { isDeviceRelativeHostId, withoutHostId } from '#utils/chat-execution.js';

/**
 * Why this device cannot place one execution, kept current: a loopback daemon
 * handed to this tab later makes its pinned agent placeable.
 *
 * @param execution - The chat's execution, as this device places it.
 * @returns The reason, or `undefined` when the execution is placeable here.
 */
const useUnplaceableExecutionReason = (execution: CadAgentExecution): string | undefined => {
  const read = useCallback(() => unplaceableExecutionReason(execution), [execution]);
  return useSyncExternalStore(onLoopbackAgentHostsChanged, read, read);
};

/**
 * The last Tau choice as this tab can run it: a host only another tab or device reaches (`origin`, `desktop`, a
 * loopback daemon) is dropped, so the chat runs on this tab's own Tau instead of on a host it cannot reach.
 *
 * @param execution - The last Tau execution chosen on this device.
 * @returns The execution to continue with here.
 */
const tauHere = (execution: CadAgentExecution): CadAgentExecution => {
  if (
    execution.kind !== 'tau' ||
    execution.hostId === undefined ||
    !isDeviceRelativeHostId(execution.hostId) ||
    isDeviceRelativeHostReachable(execution.hostId)
  ) {
    return execution;
  }
  return withoutHostId(execution);
};

/**
 * A Tau chat this tab runs locally because it cannot reach this device's placement for it (XD2), or an external-agent
 * chat opened where its agent cannot run: a phone or browser
 * reading a chat pinned to Tau Desktop, a page no daemon served, or a tab never
 * handed the loopback daemon it names (cross-device chat handoff, XD5).
 *
 * The chat keeps its pin, so it runs on its agent again where that agent is.
 * Continuing here is the person's choice, never an automatic switch
 * (`bricked-acp-chat-browser-recovery.md`): **Continue here with Tau** takes
 * the same path as picking Tau in the agent sheet, the last Tau model and
 * level on this device's own Tau, and the next turn is a new Tau run in the
 * same chat. A surface that cannot change the agent shows the reason alone.
 *
 * @returns The notice, or nothing while the execution is placeable here.
 * @public
 */
export function ChatPlacementNotice(): React.JSX.Element | undefined {
  const {
    execution: { execution, setActiveExecution, heldPlacement },
    canSelectExecution,
  } = useChatComposer();
  const { lastTauExecution } = useModels();
  const reason = useUnplaceableExecutionReason(execution);
  /* A Tau chat whose placement on this device this tab cannot reach runs here; the composer says so (XD2). */
  if (execution.kind === 'tau' && execution.hostId === undefined && heldPlacement !== undefined) {
    return (
      <ChatErrorCard
        role='status'
        aria-label='Running in this tab'
        tone='notice'
        icon={MonitorSmartphone}
        className='mb-2'
        title='Running in this tab'
        description={heldPlacementReason(heldPlacement)}
      />
    );
  }
  if (reason === undefined || execution.kind !== 'acp') {
    return undefined;
  }
  const title = `${externalAgentDisplayName(execution.agentId)} can’t run here`;
  return (
    <ChatErrorCard
      role='status'
      aria-label={title}
      tone='notice'
      icon={MonitorSmartphone}
      className='mb-2'
      title={title}
      description={reason}
      actions={
        canSelectExecution ? (
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              setActiveExecution(tauHere(lastTauExecution));
            }}
          >
            <Repeat className='size-3.5' />
            Continue here with Tau
          </Button>
        ) : undefined
      }
    />
  );
}
