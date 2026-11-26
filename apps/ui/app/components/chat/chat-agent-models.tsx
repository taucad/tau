/**
 * The agent sheet's agents and model rows: who an external agent is, which of its models runs, and how its model list
 * lines up (`docs/research/chat-agent-picker-parity-blueprint.md`). Split from `chat-agent-sheet.tsx`, which composes them.
 */

import { useMemo } from 'react';
import { Bot, Check, ChevronRight } from 'lucide-react';
import type { TauAgentHostId } from '@taucad/chat';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import { CommandGroup, CommandItem, CommandSeparator } from '@taucad/ui/components/command';
import { comboboxViewTriggerClass, menuViewTriggerChevronClass } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import type { IconId } from '@taucad/ui-kit/icons/svg-icon';
import { ModelPinButton } from '@taucad/chat-ui/components/model-pin-button';
import {
  isDefaultChoice,
  lineupOf,
  resolveDefaultChoice,
  withoutRecommended,
} from '@taucad/chat-ui/utils/model-lineup';
import type { ModelGroups, ModelLineup } from '@taucad/chat-ui/utils/model-lineup';
import { useChatComposer } from '#hooks/active-chat-provider.js';

export type Refusal = {
  readonly reason: string;
  readonly code: string;
  readonly command: string | undefined;
  readonly where: string;
};

export type SheetAgent =
  | { readonly kind: 'tau'; readonly key: 'tau'; readonly name: string }
  | {
      readonly kind: 'acp';
      readonly key: string;
      /** The agent's own name, with its host once more than one host offers agents. */
      readonly name: string;
      /** The agent's own name alone: the agent list's headings already say the host. */
      readonly displayName: string;
      readonly hostId: TauAgentHostId;
      readonly agentId: string;
      readonly where: string;
      readonly models: ExternalAgentDescriptor['models'];
      readonly defaultModel: string | undefined;
      /** The reasoning choices a fresh session offers: its `currentValue` is the level the agent runs by default. */
      readonly thoughtLevel: ExternalAgentDescriptor['thoughtLevel'];
      readonly refusal: Refusal | undefined;
    };

export type AcpSheetAgent = Extract<SheetAgent, { readonly kind: 'acp' }>;

/** The brand an external agent runs as; an agent Tau has no sprite for falls back to a generic glyph. */
const agentGlyphs: Readonly<Record<string, IconId>> = { claude: 'claude', codex: 'openai', grok: 'grok' };

export function AgentGlyph({
  agentId,
  className,
}: {
  readonly agentId: string;
  readonly className?: string;
}): React.JSX.Element {
  const id = agentGlyphs[agentId];
  return id === undefined ? (
    <Bot className={className} aria-hidden='true' />
  ) : (
    <SvgIcon id={id} className={className} aria-hidden='true' />
  );
}

/** The model an external agent runs: the person's choice, else its default, with a default alias resolved. */
export const acpModelInUse = (agent: AcpSheetAgent, selected: string | undefined): string | undefined =>
  resolveDefaultChoice(agent.models, selected ?? agent.defaultModel);

/** An agent's model name without its "(recommended)": the list says that by where it puts the model. */
export const acpModelName = (model: { readonly name: string }): string =>
  withoutRecommended(model.name).text || model.name;

/** An external agent's models, lined up; a default alias that resolves to a listed model is that model's row. */
export const acpLineupOf = (
  agent: AcpSheetAgent,
  inUse: string | undefined,
): ModelLineup<AcpSheetAgent['models'][number]> => {
  const listed = agent.models.filter(
    (entry) => !isDefaultChoice(entry) || resolveDefaultChoice(agent.models, entry.id) === entry.id,
  );
  /* The search field already names the agent; a heading is kept only to name a second host. */
  const heading = agent.name === agent.displayName ? undefined : agent.name;
  return lineupOf([{ name: heading, items: listed }], acpModelName, (entry) => entry.id === inUse);
};

/**
 * The browsed agent's model in use, and an external agent's models lined up.
 *
 * @returns The ACP lineup (none for Tau), the ACP model in use when the chat runs on this agent, and the row to open on.
 */
export const useAcpModelLineup = (
  agent: SheetAgent,
  current: SheetAgent,
  tauModelId: string,
): {
  readonly acpLineup: ModelLineup<AcpSheetAgent['models'][number]> | undefined;
  readonly acpInUse: string | undefined;
  readonly inUseValue: string | undefined;
} => {
  const {
    execution: { execution },
  } = useChatComposer();
  const selected = execution.kind === 'acp' ? execution.model : undefined;
  const isCurrent = current.key === agent.key;
  const acpInUse = agent.kind === 'acp' && agent.models.length > 0 ? acpModelInUse(agent, selected) : undefined;
  const acpLineup = useMemo(
    () => (agent.kind === 'acp' ? acpLineupOf(agent, isCurrent ? acpInUse : undefined) : undefined),
    [agent, acpInUse, isCurrent],
  );
  return {
    acpLineup,
    acpInUse: isCurrent ? acpInUse : undefined,
    inUseValue: isCurrent ? (agent.kind === 'tau' ? tauModelId : (acpInUse ?? 'default')) : undefined,
  };
};

/** An external agent's model rows: agent-authored names, rendered as text and never resolved against Tau's catalog (VI3). */
export function AcpModelRows({
  agent,
  groups,
  inUse,
  level,
  onChoose,
}: {
  readonly agent: AcpSheetAgent;
  readonly groups: ModelGroups<AcpSheetAgent['models'][number]>;
  /** The model the chat runs, when it runs on this agent. */
  readonly inUse: string | undefined;
  /** The effort the model in use runs at, drawn beside it. */
  readonly level: string | undefined;
  readonly onChoose: (agent: SheetAgent, modelId: string | undefined) => void;
}): React.JSX.Element {
  return (
    <>
      {groups.map((group) => (
        <CommandGroup key={group.name ?? ''} heading={group.name}>
          {group.items.map((entry) => {
            const isInUse = entry.id === inUse;
            const name = acpModelName(entry);
            return (
              <CommandItem
                key={entry.id}
                value={entry.id}
                keywords={[name, agent.name]}
                onSelect={() => {
                  onChoose(agent, entry.id);
                }}
              >
                <ModelRow
                  glyph={<AgentGlyph agentId={agent.agentId} className='size-4' />}
                  name={name}
                  isInUse={isInUse}
                  level={isInUse ? level : undefined}
                />
              </CommandItem>
            );
          })}
        </CommandGroup>
      ))}
    </>
  );
}

/** The More models row, drawn as the kernel picker draws More kernels. */
export function MoreModelsRow({ onOpen }: { readonly onOpen: () => void }): React.JSX.Element {
  return (
    <>
      <CommandSeparator />
      <CommandGroup>
        <CommandItem
          value={moreModelsValue}
          keywords={['More models']}
          data-slot='sheet-more-models'
          aria-haspopup='true'
          className={comboboxViewTriggerClass}
          onSelect={onOpen}
        >
          More models
          <ChevronRight aria-hidden='true' className={menuViewTriggerChevronClass} />
        </CommandItem>
      </CommandGroup>
    </>
  );
}

const moreModelsValue = 'more-models';

export function ModelRow({
  glyph,
  name,
  isInUse,
  level,
  pinned,
}: {
  readonly glyph: React.ReactNode;
  readonly name: string;
  readonly isInUse: boolean;
  readonly level: string | undefined;
  /** F1: the row's pin button, when the list is pinnable. */
  readonly pinned?: { readonly isOn: boolean; readonly toggle: () => void } | undefined;
}): React.JSX.Element {
  return (
    <span className='flex w-full min-w-0 items-center justify-between gap-2'>
      <span className='flex min-w-0 items-center gap-2'>
        {glyph}
        <span className='truncate'>{name}</span>
      </span>
      <span className='flex shrink-0 items-center gap-2'>
        {isInUse ? (
          <>
            {level ? <span className='text-xs text-muted-foreground'>{level}</span> : null}
            <Check aria-hidden='true' />
          </>
        ) : null}
        {/* F1: pulled into the row's padding so the row stays as tall; shown on a pinned row, else while highlighted. */}
        {pinned ? (
          <ModelPinButton
            name={name}
            isOn={pinned.isOn}
            tabIndex={-1}
            className={cn(
              '-my-1 -mr-1 pointer-coarse:size-9',
              !pinned.isOn && 'opacity-0 group-data-[selected=true]/row:opacity-100 pointer-coarse:opacity-100',
            )}
            onToggle={pinned.toggle}
          />
        ) : null}
      </span>
    </span>
  );
}
