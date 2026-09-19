/**
 * The model picker for an external-agent execution (V5).
 *
 * A **sibling** of `ChatModelSelector`, not a mode of it. The two draw from
 * different namespaces that must never be resolved through each other (VI3):
 * Tau's catalog row carries a provider, a family icon, a context window and a
 * per-million price, while an ACP option carries `{value, name}` and nothing
 * else, so threading one through the other's provider-grouped renderer means
 * inventing five `unknown` sentinels. Writing here also keeps the ACP path
 * clear of `withTauExecutionModel`, which converts the execution back to Tau.
 *
 * The list is the host's own probe answer, carried on the placement descriptor.
 * A host that could not probe (a logged-out CLI, a vendor timeout) advertises
 * no models, and this renders nothing at all rather than an empty menu — the
 * turn then runs on whatever the adapter's own current model is.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useAgentHostPlacements } from '#hooks/use-cad-agent-config.js';

type AgentModel = { readonly id: string; readonly name: string };

type ChatAgentModelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly children: (props: { readonly selectedModel: AgentModel }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly isNested?: boolean;
};

/**
 * The external agent this chat runs on, the models it offered, and the one in
 * force.
 *
 * Exported as a hook so the composer's tooltip can name the model without
 * wrapping the popover trigger — a `Tooltip` root between `PopoverTrigger
 * asChild` and the button swallows the trigger's props and kills the control.
 *
 * @returns The agent's models, the selected one, and whether to offer a picker.
 * @public
 */
export const useChatAgentModel = (): {
  readonly models: readonly AgentModel[];
  readonly selectedModel: AgentModel;
  readonly isOffered: boolean;
  readonly agentName: string;
} => {
  const {
    execution: { execution },
  } = useChatComposer();
  const { targets } = useAgentHostPlacements();

  const agent = useMemo(
    () =>
      execution.kind === 'acp'
        ? targets
            .find((target) => target.hostId === execution.hostId)
            ?.externalAgents?.find((candidate) => candidate.id === execution.agentId)
        : undefined,
    [execution, targets],
  );
  const models = agent?.models ?? [];
  /* The chat's own selection first, then what the host probed as this agent's
   * current model — the same order the host resolves a turn in. */
  const selectedId = (execution.kind === 'acp' ? execution.model : undefined) ?? agent?.defaultModel;
  const selectedModel = useMemo<AgentModel>(
    () => models.find((model) => model.id === selectedId) ?? { id: selectedId ?? '', name: selectedId ?? 'Default' },
    [models, selectedId],
  );
  return {
    models,
    selectedModel,
    isOffered: execution.kind === 'acp' && models.length > 0,
    agentName: agent?.displayName ?? (execution.kind === 'acp' ? execution.agentId : ''),
  };
};

export const ChatAgentModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  isNested,
  ...properties
}: ChatAgentModelSelectorProps): React.JSX.Element | undefined {
  const [open, setOpen] = useState(false);
  const {
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const { models, selectedModel, isOffered, agentName } = useChatAgentModel();
  const selectedId = selectedModel.id === '' ? undefined : selectedModel.id;

  const handleSelect = useCallback(
    (modelId: string) => {
      if (execution.kind !== 'acp') {
        return;
      }
      /* The execution is rebuilt around the model and nothing else: its kind,
       * host and agent all survive, which is what keeps picking a model from
       * silently moving the chat back to Tau. */
      setActiveExecution({ ...execution, model: modelId });
      onSelect?.(modelId);
    },
    [execution, onSelect, setActiveExecution],
  );

  if (!isOffered) {
    return undefined;
  }

  return (
    <ComboBoxResponsive
      {...properties}
      className="data-[slot='popover-content']:w-[300px]"
      popoverProperties={properties.popoverProperties}
      groupedItems={[{ name: agentName, items: [...models] }]}
      getValue={(model) => model.id}
      value={models.find((model) => model.id === selectedId)}
      title='Select a model'
      description={`Choose the model ${agentName} runs this chat on.`}
      searchPlaceHolder='Search models...'
      emptyListMessage='This agent offered no models.'
      isNested={isNested}
      isOpen={open}
      onOpenChange={setOpen}
      onSelect={handleSelect}
      onClose={onClose}
      renderLabel={(model, selected) => (
        <span className='flex w-full min-w-0 items-center justify-between gap-2'>
          {/* Agent-authored text: rendered as text, never resolved against Tau's catalog (VI3). */}
          <span className='min-w-0 truncate'>{model.name}</span>
          {selected?.id === model.id ? <Check className='size-4 shrink-0' /> : null}
        </span>
      )}
    >
      {children({ selectedModel })}
    </ComboBoxResponsive>
  );
});
