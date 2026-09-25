/**
 * The composer's one agent control: who runs the next turn, on which model,
 * how hard it thinks, and where (D5, Direction 1).
 *
 * The trigger reads as the configuration — the model's glyph (an external
 * agent's own), the model, the level a step lighter, Fast mode, a 12 px
 * chevron. It opens a settings sheet: the agent as a row when there is a
 * choice (Q18), the chosen model as a row, then Reasoning, the agent's
 * switches and where it runs. The agent row drills into the agents, grouped
 * by host; the model row into that agent's models, in the same card. Choosing
 * a model returns to the sheet with that model's settings, so a level is only
 * ever set on the model in use.
 *
 * Tau's level is `TauAgentExecution.effort`; an external agent's is its own
 * `thought_level` option, written verbatim and never translated (VI3).
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Plus, Server, Zap } from 'lucide-react';
import type { AcpAgentExecution, TauAgentHostId } from '@taucad/chat';
import type { ReasoningLevel } from '@taucad/chat/constants';
import type { ExternalAgentDescriptor } from '@taucad/agent-host';
import { Button } from '@taucad/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@taucad/ui/components/command';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@taucad/ui/components/drawer';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Switch } from '@taucad/ui/components/switch';
import { Tabs, TabsList, TabsTrigger } from '@taucad/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { IconId } from '#components/icons/svg-icon.js';
import { Tau } from '#components/icons/tau.js';
import { ThoughtBubble } from '#components/icons/thought-bubble.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { configOptionOf, configValues } from '#components/chat/use-agent-config.js';
import type { AgentConfig, AgentConfigOption } from '#components/chat/use-agent-config.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useAgentHostPlacements, useBrowserAgentHostProjectAvailability } from '#hooks/use-cad-agent-config.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useModels } from '#hooks/use-models.js';
import type { Model } from '#hooks/use-models.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { externalAgentFixCommand, externalAgentRefusalReasons } from '#lib/external-agent.js';
import { ariaKeyShortcuts, formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { groupModelsByTier } from '#utils/model-tier.js';
import { modelReasoning, offeredReasoningLevels } from '#utils/model-reasoning.js';

/** How a level reads, everywhere a person sees one. @public */
export const reasoningLevelNames: Readonly<Record<ReasoningLevel, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

/** Opens the sheet from the composer being typed in (F6). @public */
export const openModelSelectorKeyCombination = { key: '/', modKey: true } satisfies KeyCombination;

/** The ghost pill every composer control shares: h-7, round, no boundary at rest, muted until hover. @public */
export const ghostPillClass = 'h-7 rounded-full px-2.5 font-normal text-muted-foreground hover:text-foreground';

type Option = { readonly id: string; readonly name: string; readonly isDisabled?: boolean };

// ---------------------------------------------------------------------------
// The segmented control
// ---------------------------------------------------------------------------

/**
 * Segments size to their labels and share the spare width, so six values fit
 * the 320 px card. Muted at rest; the chosen label turns foreground 60 ms into
 * the thumb's glide instead of animating colour (transform and opacity only).
 */
const segmentClass = cn(
  'h-full w-auto min-w-0 flex-auto overflow-hidden rounded-sm border-0 px-1.5 text-xs font-normal text-muted-foreground dark:text-muted-foreground',
  'hover:bg-accent/50 hover:text-foreground',
  'data-[state=active]:font-medium data-[state=active]:text-foreground dark:data-[state=active]:text-foreground',
  'data-[state=active]:hover:bg-transparent',
  'transition-[color] delay-[60ms] duration-0 motion-reduce:delay-0',
);

/**
 * A value control on the stock `Tabs` well, with one neutral `bg-accent` thumb
 * that glides to the chosen segment (operator ruling: the chip is neutral, not
 * the primary finish). Segments differ in width, so the glide is a FLIP: the
 * thumb takes the new width at once, is scaled back to where it visibly is,
 * and only its transform animates — 150 ms, none under reduced motion. The
 * first placement, and a resize, land without motion. Callers key it by its
 * options, so another model's levels land without a glide.
 *
 * Its values are `tab`s, never `option`s, so a query for options finds only
 * models (Finding 8).
 */
function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly options: readonly Option[];
  readonly onChange: (id: string) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const isPlaced = useRef(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    const thumb = thumbRef.current;
    if (!list || !thumb) {
      return undefined;
    }
    const place = (shouldGlide: boolean): void => {
      const active = [...list.querySelectorAll<HTMLElement>('[data-segment]')].find(
        (segment) => segment.dataset['segment'] === value,
      );
      if (!active) {
        thumb.style.opacity = '0';
        isPlaced.current = false;
        return;
      }
      /* Sub-pixel rects: segments sized by content land on fractional pixels. */
      const listBox = list.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      const from = { x: thumbBox.left - listBox.left - list.clientLeft, w: thumbBox.width };
      const to = { x: activeBox.left - listBox.left - list.clientLeft, w: activeBox.width };
      thumb.style.opacity = '1';
      thumb.style.top = `${activeBox.top - listBox.top - list.clientTop}px`;
      thumb.style.height = `${activeBox.height}px`;
      thumb.style.width = `${to.w}px`;
      const isMove = Math.abs(from.x - to.x) > 0.5 || Math.abs(from.w - to.w) > 0.5;
      thumb.style.transition = 'none';
      if (!shouldGlide || !isPlaced.current || !isMove || to.w === 0) {
        thumb.style.transform = `translateX(${to.x}px)`;
        isPlaced.current = true;
        return;
      }
      thumb.style.transform = `translateX(${from.x}px) scaleX(${from.w / to.w})`;
      void thumb.offsetWidth; // Commit the starting frame.
      thumb.style.transition = '';
      thumb.style.transform = `translateX(${to.x}px)`;
    };
    place(true);
    /* A real resize (webfonts, text size) re-places without motion; an element's first report only records its size. */
    const sizes = new Map<Element, number>();
    const observer = new ResizeObserver((entries) => {
      let isResized = false;
      for (const entry of entries) {
        const previous = sizes.get(entry.target);
        sizes.set(entry.target, entry.contentRect.width);
        isResized ||= previous !== undefined && Math.abs(previous - entry.contentRect.width) > 0.1;
      }
      if (isResized) {
        place(false);
      }
    });
    observer.observe(list);
    for (const tab of list.querySelectorAll('[role="tab"]')) {
      observer.observe(tab);
    }
    return () => {
      observer.disconnect();
    };
  }, [value]);
  return (
    <Tabs value={value ?? ''} className='gap-0' onValueChange={onChange}>
      <TabsList
        ref={listRef}
        aria-label={label}
        activeClassName='hidden'
        className='relative w-full gap-0.5 p-0.5 data-[orientation=horizontal]:flex data-[orientation=horizontal]:min-h-7'
      >
        <span
          ref={thumbRef}
          aria-hidden='true'
          data-slot='segmented-thumb'
          className='pointer-events-none absolute top-0 left-0 origin-left rounded-sm border border-border bg-accent opacity-0 shadow-xs transition-transform duration-150 ease-out motion-reduce:transition-none'
        />
        {options.map((option) => (
          <TabsTrigger
            key={option.id}
            value={option.id}
            data-segment={option.id}
            disabled={option.isDisabled}
            className={segmentClass}
          >
            {option.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Who can run the chat
// ---------------------------------------------------------------------------

type Refusal = {
  readonly reason: string;
  readonly code: string;
  readonly command: string | undefined;
  readonly where: string;
};

type SheetAgent =
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
      readonly refusal: Refusal | undefined;
    };

type AcpSheetAgent = Extract<SheetAgent, { readonly kind: 'acp' }>;

const tauAgent: SheetAgent = { kind: 'tau', key: 'tau', name: 'Tau' };

/** The brand an external agent runs as; an agent Tau has no sprite for falls back to a generic glyph. */
const agentGlyphs: Readonly<Record<string, IconId>> = { claude: 'claude', codex: 'openai', grok: 'grok' };

function AgentGlyph({
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

/** An agent's mark where agents are chosen: Tau's own, or the external agent's. */
function SheetAgentGlyph({
  agent,
  className,
}: {
  readonly agent: SheetAgent;
  readonly className?: string;
}): React.JSX.Element {
  return agent.kind === 'tau' ? (
    <Tau className={className} aria-hidden='true' />
  ) : (
    <AgentGlyph agentId={agent.agentId} className={cn(className, agent.refusal && 'opacity-50')} />
  );
}

const hostWhere = (placement: AgentHostPlacementTarget): string =>
  placement.hostId === 'desktop' ? 'this computer' : placement.label;

const acpKey = (hostId: TauAgentHostId, agentId: string): string =>
  `acp:${encodeURIComponent(hostId)}:${encodeURIComponent(agentId)}`;

const acpAgent = (
  placement: AgentHostPlacementTarget,
  descriptor: ExternalAgentDescriptor,
  isNamedByHost: boolean,
): AcpSheetAgent => {
  const where = hostWhere(placement);
  const refusal: Refusal | undefined = placement.online
    ? descriptor.refusal === undefined
      ? undefined
      : {
          reason: externalAgentRefusalReasons[descriptor.refusal],
          code: descriptor.refusal,
          command: externalAgentFixCommand(descriptor.id, descriptor.refusal),
          where,
        }
    : { reason: `${placement.label} is offline`, code: 'HOST_OFFLINE', command: undefined, where };
  return {
    kind: 'acp',
    key: acpKey(placement.hostId, descriptor.id),
    name: isNamedByHost ? `${descriptor.displayName} · ${placement.label}` : descriptor.displayName,
    displayName: descriptor.displayName,
    hostId: placement.hostId,
    agentId: descriptor.id,
    where,
    models: descriptor.models,
    defaultModel: descriptor.defaultModel,
    refusal,
  };
};

/**
 * Every agent this surface offers, and the one the chat runs on.
 *
 * @returns The agents in tab order and the chat's own.
 */
const useSheetAgents = (
  placements: readonly AgentHostPlacementTarget[],
): { readonly agents: readonly SheetAgent[]; readonly current: SheetAgent } => {
  const {
    execution: { execution },
    canSelectExecution,
  } = useChatComposer();
  const agents = useMemo<readonly SheetAgent[]>(() => {
    if (!canSelectExecution) {
      return [tauAgent];
    }
    const hosting = placements.filter((placement) => (placement.externalAgents ?? []).length > 0);
    return [
      tauAgent,
      ...hosting.flatMap((placement) =>
        (placement.externalAgents ?? []).map((descriptor) => acpAgent(placement, descriptor, hosting.length > 1)),
      ),
    ];
  }, [canSelectExecution, placements]);
  const current = useMemo<SheetAgent>(() => {
    if (execution.kind === 'tau') {
      return tauAgent;
    }
    const key = acpKey(execution.hostId, execution.agentId);
    /* A persisted selection no host describes yet still names itself. */
    return (
      agents.find((agent) => agent.key === key) ??
      acpAgent(
        { hostId: execution.hostId, rung: 2, label: execution.hostId, workspaceRoot: '', online: false },
        { id: execution.agentId, displayName: execution.agentId, models: [] },
        false,
      )
    );
  }, [agents, execution]);
  return { agents, current };
};

// ---------------------------------------------------------------------------
// What the chosen model is set to
// ---------------------------------------------------------------------------

type SelectOption = Extract<AgentConfigOption, { readonly type: 'select' }>;

type SheetModel = {
  readonly glyph: React.ReactNode;
  readonly name: string;
  /** One line under the name: its provider, or the id the agent sent. The agent row names the agent. */
  readonly facts: string;
  readonly levels: readonly Option[];
  readonly level: Option | undefined;
  /** An agent's own "Default" effort means the agent decides, so the trigger does not print it. */
  readonly isLevelShown: boolean;
  readonly note: string | undefined;
  readonly setLevel: (id: string) => void;
  readonly switches: ReadonlyArray<Extract<AgentConfigOption, { readonly type: 'boolean' }>>;
  readonly selects: readonly SelectOption[];
  readonly isFast: boolean;
};

const isFastOption = (option: AgentConfigOption): boolean => /fast/i.test(`${option.id} ${option.name}`);

const isDefaultValue = (option: Option): boolean => option.id === 'default' || /^default\b/i.test(option.name);

/**
 * The trigger's and the sheet's reading of the chat's model, from one place so
 * the two can never disagree.
 */
const useSheetModel = (current: SheetAgent, agentConfig: AgentConfig): SheetModel => {
  const {
    model: { model, effort, setActiveEffort },
    execution: { execution },
  } = useChatComposer();
  const glyphClass = 'size-3.5 shrink-0 grayscale';
  if (current.kind === 'tau') {
    const offered = offeredReasoningLevels(model.model);
    const levels = offered.map((id) => ({ id, name: reasoningLevelNames[id] }));
    const defaultLevel = modelReasoning(model.model)?.effort;
    const level = levels.find((entry) => entry.id === effort);
    return {
      glyph: <SvgIcon id={model.family} className={glyphClass} aria-hidden='true' />,
      name: model.name,
      facts: model.provider.name,
      levels,
      level,
      isLevelShown: level !== undefined,
      note:
        level === undefined || defaultLevel === undefined
          ? undefined
          : level.id === defaultLevel
            ? 'The default for this model'
            : `${reasoningLevelNames[defaultLevel]} is the default`,
      setLevel: (id) => {
        setActiveEffort(id as ReasoningLevel);
      },
      switches: [],
      selects: [],
      isFast: false,
    };
  }
  const selected = execution.kind === 'acp' ? execution.model : undefined;
  const modelId = selected ?? current.defaultModel;
  const thought = configOptionOf(agentConfig, 'thought_level');
  const levels = thought ? configValues(thought).map((value) => ({ id: value.value, name: value.name })) : [];
  const thoughtValue = thought ? agentConfig.valueOf(thought) : undefined;
  const level = levels.find((entry) => entry.id === thoughtValue);
  const switches = agentConfig.options.filter(
    (option): option is Extract<AgentConfigOption, { readonly type: 'boolean' }> => option.type === 'boolean',
  );
  return {
    glyph: <AgentGlyph agentId={current.agentId} className={glyphClass} />,
    name: current.models.find((entry) => entry.id === modelId)?.name ?? modelId ?? 'Default',
    facts: modelId ?? '',
    levels,
    level,
    isLevelShown: level !== undefined && !isDefaultValue(level),
    note: thought
      ? (configValues(thought).find((value) => value.value === thoughtValue)?.description ?? undefined)
      : undefined,
    setLevel: (id) => {
      if (thought) {
        agentConfig.select(thought.id, id);
      }
    },
    switches,
    selects: agentConfig.options.filter(
      (option): option is SelectOption =>
        option.type === 'select' && option.category !== 'mode' && option.category !== 'thought_level',
    ),
    isFast: switches.some((option) => isFastOption(option) && agentConfig.valueOf(option) === true),
  };
};

/** The trigger's accessible name: the agent when it is not Tau, the model, the level, Fast mode. */
const triggerName = (current: SheetAgent, model: SheetModel): string =>
  [
    current.kind === 'acp' ? current.name : undefined,
    model.name,
    model.isLevelShown && model.level ? `reasoning ${model.level.name}` : undefined,
    model.isFast ? 'Fast mode' : undefined,
  ]
    .filter(Boolean)
    .join(', ');

// ---------------------------------------------------------------------------
// The sheet's sections
// ---------------------------------------------------------------------------

function ReasoningSection({ label, model }: { readonly label: string; readonly model: SheetModel }): React.JSX.Element {
  return (
    <section aria-label={label} data-slot='reasoning-section' className='space-y-2 border-t px-4 pt-3 pb-3.5'>
      <div className='flex items-center justify-between gap-2'>
        <h5 className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
          <ThoughtBubble aria-hidden='true' className='size-3.5' />
          Reasoning
        </h5>
        <KeyShortcut variant='ghost'>← →</KeyShortcut>
      </div>
      <SegmentedControl
        key={model.levels.map((level) => level.id).join(',')}
        label={label}
        value={model.level?.id}
        options={model.levels}
        onChange={model.setLevel}
      />
      <p data-slot='reasoning-note' className='h-4 truncate text-xs text-muted-foreground'>
        {model.note}
      </p>
    </section>
  );
}

/** One of the agent's own switches — Fast mode among them — drawn as the shipped Switch. */
function AgentSwitch({
  option,
  agentConfig,
}: {
  readonly option: Extract<AgentConfigOption, { readonly type: 'boolean' }>;
  readonly agentConfig: AgentConfig;
}): React.JSX.Element {
  const id = useId();
  return (
    <section data-slot='agent-switch' className='border-t px-4 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <label htmlFor={id} className='flex items-center gap-1.5 text-xs font-medium'>
          {isFastOption(option) ? <Zap aria-hidden='true' className='size-3.5 text-muted-foreground' /> : null}
          {option.name}
        </label>
        <Switch
          id={id}
          checked={agentConfig.valueOf(option) === true}
          {...(option.description ? { 'aria-describedby': `${id}-description` } : {})}
          onCheckedChange={(checked) => {
            agentConfig.select(option.id, checked);
          }}
        />
      </div>
      {option.description ? (
        <p id={`${id}-description`} className='mt-1 text-xs text-muted-foreground'>
          {option.description}
        </p>
      ) : null}
    </section>
  );
}

/** Any other choice the agent offers: a short list shows as segments, a long one as rows. */
function AgentSelect({
  option,
  agentConfig,
}: {
  readonly option: SelectOption;
  readonly agentConfig: AgentConfig;
}): React.JSX.Element {
  const values = configValues(option).map((value) => ({ id: value.value, name: value.name }));
  return (
    <section aria-label={option.name} className='space-y-2 border-t px-4 pt-3 pb-3.5'>
      <h5 className='text-xs font-medium text-muted-foreground'>{option.name}</h5>
      <SegmentedControl
        label={option.name}
        value={String(agentConfig.valueOf(option))}
        options={values}
        onChange={(value) => {
          agentConfig.select(option.id, value);
        }}
      />
    </section>
  );
}

/** Where a Tau turn runs: this browser or a Tau Host. A choice only when there is one. */
function RunsOn({
  current,
  placements,
}: {
  readonly current: SheetAgent;
  readonly placements: readonly AgentHostPlacementTarget[];
}): React.JSX.Element {
  const {
    execution: { execution, setActiveExecution },
    model: { model },
    canSelectExecution,
  } = useChatComposer();
  const browserHost = useBrowserAgentHostProjectAvailability(model.provider.id);
  if (current.kind === 'acp') {
    return (
      <p data-slot='runs-on' className='flex items-start gap-2 border-t px-4 py-3 text-xs text-muted-foreground'>
        <Server aria-hidden='true' className='mt-px size-3.5 shrink-0' />
        Runs with your local {current.name} login on {current.where}, in this project&apos;s tree.
      </p>
    );
  }
  const options: readonly Option[] = [
    /* D18: the desktop build never constructs the browser worker, so it never offers the browser. */
    ...(isDesktopTarget() ? [] : [{ id: 'browser', name: 'This browser' }]),
    ...(canSelectExecution
      ? placements.map((placement) => ({
          id: placement.hostId,
          name: placement.hostId === 'desktop' ? 'This computer' : placement.label,
          isDisabled: !placement.online,
        }))
      : []),
  ];
  const hostId = execution.kind === 'tau' ? execution.hostId : undefined;
  const value = hostId ?? 'browser';
  const placement = placements.find((entry) => entry.hostId === hostId);
  const note =
    hostId === undefined
      ? browserHost.status === 'unavailable'
        ? browserHost.reason
        : browserHost.status === 'available'
          ? (browserHost.caveat ?? 'Runs in this browser')
          : 'Runs in this browser'
      : placement?.online === false
        ? `${placement.label} is offline`
        : placement?.workspaceRoot
          ? `In ${placement.workspaceRoot}`
          : `Runs on ${placement === undefined ? hostId : hostWhere(placement)}`;
  if (options.length < 2) {
    return (
      <p data-slot='runs-on' className='flex items-start gap-2 border-t px-4 py-3 text-xs text-muted-foreground'>
        <Server aria-hidden='true' className='mt-px size-3.5 shrink-0' />
        {note}
      </p>
    );
  }
  return (
    <section data-slot='runs-on' aria-label='Runs on' className='space-y-2 border-t px-4 pt-3 pb-3.5'>
      <h5 className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
        <Server aria-hidden='true' className='size-3.5' />
        Runs on
      </h5>
      <SegmentedControl
        label='Where Tau runs'
        value={value}
        options={options}
        onChange={(next) => {
          if (execution.kind !== 'tau') {
            return;
          }
          /* Dropping `hostId` is what returns a chat to this browser's own host. */
          const { hostId: _hostId, ...browser } = execution;
          setActiveExecution(next === 'browser' ? browser : { ...browser, hostId: next });
        }}
      />
      <p className='h-4 truncate text-xs text-muted-foreground' title={note}>
        {note}
      </p>
    </section>
  );
}

/** An agent the host lists but cannot start: the reason in the host's words, the fix, and the code support needs (F8). */
function Unavailable({ agent }: { readonly agent: AcpSheetAgent & { readonly refusal: Refusal } }): React.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { refusal } = agent;
  return (
    <div data-slot='agent-unavailable' className='flex flex-col gap-2 px-3 py-4'>
      <p className='flex items-start gap-2 text-sm font-medium'>
        <CircleAlert aria-hidden='true' className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        {agent.name} can&apos;t start on {refusal.where}
      </p>
      <p className='pl-6 text-xs text-muted-foreground'>
        {refusal.reason}. <span className='font-mono text-[11px]'>{refusal.code}</span>
      </p>
      {refusal.command === undefined ? null : (
        <>
          <p className='pl-6 text-xs text-muted-foreground'>
            Run <code className='rounded-xs bg-muted px-1 font-mono text-foreground'>{refusal.command}</code> on{' '}
            {refusal.where}, then reopen this menu.
          </p>
          <div className='pl-6'>
            <Button
              variant='outline'
              size='sm'
              className='h-7 gap-1.5 text-xs'
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(refusal.command ?? '');
                  setCopyState('copied');
                } catch {
                  setCopyState('failed');
                }
              }}
            >
              {copyState === 'copied' ? (
                <Check aria-hidden='true' className='size-3.5' />
              ) : (
                <Copy aria-hidden='true' className='size-3.5' />
              )}
              {copyState === 'copied' ? 'Copied' : 'Copy command'}
            </Button>
            {copyState === 'failed' ? (
              <p role='status' className='mt-1 text-xs text-muted-foreground'>
                This browser blocked the clipboard; select the command instead.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The model list
// ---------------------------------------------------------------------------

/** Tau's catalog grouped as shipped — Fast, Balanced, Frontier — including the chat's model when the user hid it. */
const useTauModelGroups = (selectedId: string): ReadonlyArray<{ readonly name: string; readonly items: Model[] }> => {
  const { data: allModels = [], availableModels } = useModels();
  return useMemo(() => {
    const current = allModels.find((entry) => entry.id === selectedId);
    const visible =
      current && !availableModels.some((entry) => entry.id === current.id)
        ? [...availableModels, current]
        : availableModels;
    return groupModelsByTier(visible);
  }, [allModels, availableModels, selectedId]);
};

function ModelRow({
  glyph,
  name,
  isInUse,
  level,
}: {
  readonly glyph: React.ReactNode;
  readonly name: string;
  readonly isInUse: boolean;
  readonly level: string | undefined;
}): React.JSX.Element {
  return (
    <span className='flex w-full min-w-0 items-center justify-between gap-2'>
      <span className='flex min-w-0 items-center gap-2'>
        {glyph}
        <span className='truncate'>{name}</span>
      </span>
      {isInUse ? (
        <span className='flex shrink-0 items-center gap-2'>
          {level ? <span className='text-xs text-muted-foreground'>{level}</span> : null}
          <Check aria-hidden='true' />
        </span>
      ) : null}
    </span>
  );
}

/** Backspace in an empty search goes back one step. */
const backOnEmpty =
  (query: string, onBack: () => void) =>
  (event: React.KeyboardEvent): void => {
    if (event.key === 'Backspace' && query === '') {
      event.preventDefault();
      onBack();
    }
  };

/**
 * One agent's models: Tau's catalog by tier, or an external agent's own list.
 * Choosing one on an agent the chat isn't on moves the chat to that agent at
 * its own defaults.
 */
function ModelList({
  agent,
  current,
  sheetModel,
  onChoose,
  onBack,
}: {
  readonly agent: SheetAgent;
  readonly current: SheetAgent;
  readonly sheetModel: SheetModel;
  /** `modelId` is absent only for an external agent that runs on its own default. */
  readonly onChoose: (agent: SheetAgent, modelId: string | undefined) => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const {
    model: { modelId },
    execution: { execution },
  } = useChatComposer();
  const { open: openSettings } = useSettingsDialog();
  const [query, setQuery] = useState('');
  const tauGroups = useTauModelGroups(modelId);
  const selectedAcpModel = execution.kind === 'acp' ? execution.model : undefined;

  if (agent.kind === 'acp' && agent.refusal !== undefined) {
    return <Unavailable agent={{ ...agent, refusal: agent.refusal }} />;
  }
  return (
    <Command className='min-h-0 flex-1 bg-transparent' onKeyDown={backOnEmpty(query, onBack)}>
      <CommandInput
        autoFocus
        placeholder={agent.kind === 'tau' ? 'Search models...' : `Search ${agent.displayName} models...`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className='max-h-none min-h-0 flex-1'>
        <CommandEmpty className='mx-2'>No models match “{query}”.</CommandEmpty>
        {agent.kind === 'tau' ? (
          tauGroups.map((group) => (
            <CommandGroup key={group.name} heading={group.name}>
              {group.items.map((entry) => {
                const isInUse = current.kind === 'tau' && entry.id === modelId;
                return (
                  <CommandItem
                    key={entry.id}
                    value={entry.id}
                    keywords={[entry.name, entry.provider.name, group.name]}
                    onSelect={() => {
                      onChoose(agent, entry.id);
                    }}
                  >
                    <ModelRow
                      glyph={<SvgIcon id={entry.details.family} aria-hidden='true' />}
                      name={entry.name}
                      isInUse={isInUse}
                      level={isInUse ? sheetModel.level?.name : undefined}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))
        ) : agent.models.length === 0 ? (
          /* A failed model probe never drops the agent (EQ1 fallback B): it still runs, on its own default. */
          <CommandGroup heading={agent.name}>
            <CommandItem
              value='default'
              keywords={[agent.name]}
              onSelect={() => {
                onChoose(agent, undefined);
              }}
            >
              <ModelRow
                glyph={<AgentGlyph agentId={agent.agentId} className='size-4' />}
                name='Default model'
                isInUse={current.key === agent.key}
                level={undefined}
              />
            </CommandItem>
          </CommandGroup>
        ) : (
          <CommandGroup heading={agent.name}>
            {agent.models.map((entry) => {
              const isInUse = current.key === agent.key && entry.id === (selectedAcpModel ?? agent.defaultModel);
              return (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  keywords={[entry.name, agent.name]}
                  onSelect={() => {
                    onChoose(agent, entry.id);
                  }}
                >
                  {/* Agent-authored text: rendered as text, never resolved against Tau's catalog (VI3). */}
                  <ModelRow
                    glyph={<AgentGlyph agentId={agent.agentId} className='size-4' />}
                    name={entry.name}
                    isInUse={isInUse}
                    level={isInUse && sheetModel.isLevelShown ? sheetModel.level?.name : undefined}
                  />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      {agent.kind === 'tau' ? (
        <div className='border-t p-1'>
          <button
            type='button'
            className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
            onClick={() => {
              openSettings('models');
            }}
          >
            <Plus />
            Add models
          </button>
        </div>
      ) : null}
    </Command>
  );
}

/**
 * The agents the Agent row opens (Q18): Tau, then each host's agents under
 * that host, so a second host is a heading rather than a suffix on every
 * name. The agent in use shows its model; one its host can't start says so.
 * Choosing an agent shows its models and changes nothing until one is chosen.
 */
function AgentList({
  agents,
  current,
  sheetModel,
  onBrowse,
  onBack,
}: {
  readonly agents: readonly SheetAgent[];
  readonly current: SheetAgent;
  readonly sheetModel: SheetModel;
  readonly onBrowse: (agent: SheetAgent) => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const hosts = [
    ...new Map(
      agents.flatMap((agent) => (agent.kind === 'acp' ? [[agent.hostId, agent.where] as const] : [])),
    ).entries(),
  ];
  const row = (agent: SheetAgent): React.JSX.Element => {
    const isInUse = agent.key === current.key;
    const isRefused = agent.kind === 'acp' && agent.refusal !== undefined;
    return (
      <CommandItem
        key={agent.key}
        value={agent.key}
        keywords={[agent.name]}
        aria-label={[agent.name, isInUse ? 'in use' : undefined, isRefused ? 'unavailable' : undefined]
          .filter(Boolean)
          .join(', ')}
        onSelect={() => {
          onBrowse(agent);
        }}
      >
        <span className='flex w-full min-w-0 items-center justify-between gap-2'>
          <span className='flex min-w-0 items-center gap-2'>
            <SheetAgentGlyph agent={agent} className='size-4 shrink-0' />
            <span className='truncate'>{agent.kind === 'tau' ? agent.name : agent.displayName}</span>
          </span>
          {isRefused ? (
            <span className='flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'>
              Can&apos;t start
              <CircleAlert aria-hidden='true' />
            </span>
          ) : isInUse ? (
            <span className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
              <span className='truncate'>{sheetModel.name}</span>
              <Check aria-hidden='true' className='text-foreground' />
            </span>
          ) : null}
        </span>
      </CommandItem>
    );
  };
  return (
    <Command
      data-slot='agent-list'
      className='min-h-0 flex-1 bg-transparent'
      defaultValue={current.key}
      onKeyDown={backOnEmpty(query, onBack)}
    >
      <CommandInput autoFocus placeholder='Search agents...' value={query} onValueChange={setQuery} />
      <CommandList className='max-h-none min-h-0 flex-1'>
        <CommandEmpty className='mx-2'>No agents match “{query}”.</CommandEmpty>
        <CommandGroup>{agents.filter((agent) => agent.kind === 'tau').map((agent) => row(agent))}</CommandGroup>
        {hosts.map(([hostId, where]) => (
          <CommandGroup key={hostId} heading={`On ${where}`}>
            {agents.filter((agent) => agent.kind === 'acp' && agent.hostId === hostId).map((agent) => row(agent))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

// ---------------------------------------------------------------------------
// The sheet and its trigger
// ---------------------------------------------------------------------------

/** Where the sheet takes focus when it opens: the chosen level, so ← → change it at once; else the model row. */
const focusOnOpen = (surface: HTMLElement | undefined): void => {
  const level = surface?.querySelector<HTMLElement>(
    '[data-slot=reasoning-section] [role=tab][data-state=active]:not([disabled])',
  );
  (level ?? surface?.querySelector<HTMLElement>('[data-slot=sheet-model]'))?.focus();
};

type SheetView = 'settings' | 'agents' | 'models';

function Sheet({
  agents,
  current,
  sheetModel,
  placements,
  agentConfig,
}: {
  readonly agents: readonly SheetAgent[];
  readonly current: SheetAgent;
  readonly sheetModel: SheetModel;
  readonly placements: readonly AgentHostPlacementTarget[];
  readonly agentConfig: AgentConfig;
}): React.JSX.Element {
  const {
    model: { setActiveModel },
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const { defaultExecution } = useModels();
  const [view, setView] = useState<SheetView>('settings');
  /* The agent whose models the list shows: the chat's own, or one browsed from the agents. */
  const [browseKey, setBrowseKey] = useState(current.key);
  const [isFromAgents, setIsFromAgents] = useState(false);
  const hasNavigated = useRef(false);
  /* Back returns focus to the row the person left from; a choice, to the chosen level. */
  const returnTo = useRef<'agent' | 'model' | 'level'>('level');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const agentRowRef = useRef<HTMLButtonElement>(null);
  const modelRowRef = useRef<HTMLButtonElement>(null);
  const hasChoice = agents.length > 1;
  const browsed = agents.find((agent) => agent.key === browseKey) ?? current;
  useEffect(() => {
    if (!hasNavigated.current || view !== 'settings') {
      return;
    }
    if (returnTo.current === 'level') {
      focusOnOpen(surfaceRef.current ?? undefined);
    } else {
      (returnTo.current === 'agent' ? agentRowRef : modelRowRef).current?.focus();
    }
  }, [view]);
  const go = (next: SheetView): void => {
    hasNavigated.current = true;
    setView(next);
  };
  const back = (): void => {
    if (view === 'models' && isFromAgents) {
      setIsFromAgents(false);
      go('agents');
      return;
    }
    go('settings');
  };

  const choose = (agent: SheetAgent, modelId: string | undefined): void => {
    if (agent.kind === 'tau') {
      if (modelId === undefined) {
        return;
      }
      if (execution.kind === 'tau') {
        /* Keeps the host and the chosen level; the level is clamped where it is read. */
        setActiveModel(modelId);
      } else {
        /* Back from an external agent: the remembered level, on this device's own Tau. */
        setActiveExecution({
          ...defaultExecution,
          model: modelId,
          ...(isDesktopTarget() ? { hostId: 'desktop' } : {}),
        });
      }
    } else {
      const isSameAgent =
        execution.kind === 'acp' && execution.hostId === agent.hostId && execution.agentId === agent.agentId;
      const { model: _model, ...base }: AcpAgentExecution = isSameAgent
        ? execution
        : { kind: 'acp', hostId: agent.hostId, agentId: agent.agentId };
      setActiveExecution(modelId === undefined ? base : { ...base, model: modelId });
    }
    returnTo.current = 'level';
    setIsFromAgents(false);
    go('settings');
  };

  const reasoningLabel = `Reasoning for ${current.kind === 'acp' ? `${current.name} ` : ''}${sheetModel.name}`;
  const rowClass = cn(menuItemVariants({ highlight: 'focus' }), 'w-[calc(100%-0.5rem)] hover:bg-menu-highlight');
  return (
    <div ref={surfaceRef} data-slot='agent-sheet' className='w-full overflow-hidden'>
      {view === 'settings' ? (
        <div
          data-slot='sheet-settings'
          className='flex flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2'
        >
          {hasChoice ? (
            <button
              ref={agentRowRef}
              type='button'
              data-slot='sheet-agent'
              aria-label={`Agent: ${current.name}. Change`}
              className={cn(rowClass, 'mx-1 mt-1 h-8 gap-2 px-2.5')}
              onClick={() => {
                returnTo.current = 'agent';
                go('agents');
              }}
            >
              <span className='shrink-0 text-xs text-muted-foreground'>Agent</span>
              <span className='ml-auto flex min-w-0 items-center gap-1.5 text-xs'>
                <SheetAgentGlyph agent={current} className='size-3.5 shrink-0' />
                <span className='truncate'>{current.name}</span>
              </span>
              <ChevronRight aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
            </button>
          ) : null}
          <button
            ref={modelRowRef}
            type='button'
            data-slot='sheet-model'
            aria-label={`Model: ${current.kind === 'acp' ? `${current.name}, ` : ''}${sheetModel.name}. Change`}
            className={cn(rowClass, 'm-1 h-auto gap-2.5 px-2.5 py-2')}
            onClick={() => {
              returnTo.current = 'model';
              setBrowseKey(current.key);
              setIsFromAgents(false);
              go('models');
            }}
          >
            <span className='[&>svg]:size-5 [&>svg]:grayscale-0'>{sheetModel.glyph}</span>
            <span className='flex min-w-0 flex-1 flex-col items-start text-left'>
              <span className='w-full truncate text-sm font-medium'>{sheetModel.name}</span>
              {sheetModel.facts ? (
                <span className='w-full truncate text-xs text-muted-foreground'>{sheetModel.facts}</span>
              ) : null}
            </span>
            <ChevronRight aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
          </button>
          {sheetModel.levels.length > 1 ? <ReasoningSection label={reasoningLabel} model={sheetModel} /> : null}
          {sheetModel.switches.map((option) => (
            <AgentSwitch key={option.id} option={option} agentConfig={agentConfig} />
          ))}
          {sheetModel.selects.map((option) => (
            <AgentSelect key={option.id} option={option} agentConfig={agentConfig} />
          ))}
          <RunsOn current={current} placements={placements} />
        </div>
      ) : (
        <div
          data-slot={view === 'agents' ? 'sheet-agents' : 'sheet-models'}
          /* The agents are as tall as they are; a model list keeps its fixed height. */
          className={cn(
            'flex flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2',
            view === 'agents' ? 'max-h-[min(25rem,70vh)]' : 'h-[25rem] max-h-[70vh]',
          )}
        >
          <div className='flex h-9 shrink-0 items-center gap-1 border-b px-1'>
            <Button
              variant='ghost'
              size='sm'
              aria-label={view === 'models' && isFromAgents ? 'Back to agents' : 'Back to settings'}
              className='h-7 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground'
              onClick={back}
            >
              <ChevronLeft aria-hidden='true' className='size-4' />
              {view === 'models' && isFromAgents ? 'Agents' : sheetModel.name}
            </Button>
          </div>
          {view === 'agents' ? (
            <AgentList
              agents={agents}
              current={current}
              sheetModel={sheetModel}
              onBrowse={(agent) => {
                setBrowseKey(agent.key);
                setIsFromAgents(true);
                go('models');
              }}
              onBack={back}
            />
          ) : (
            <ModelList
              key={browsed.key}
              agent={browsed}
              current={current}
              sheetModel={sheetModel}
              onChoose={choose}
              onBack={back}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The trigger, beside Send, and the sheet it opens — a popover on desktop, a
 * drawer on a phone. ⌘/ opens it. Closing hands focus back to the editor unless
 * the person clicked somewhere else (F14).
 *
 * @public
 */
export function ChatAgentSheet({
  agentConfig,
  focusEditor,
  enableShortcut = true,
}: {
  readonly agentConfig: AgentConfig;
  readonly focusEditor: () => void;
  /** Only the composer being typed in owns ⌘/ (F6). */
  readonly enableShortcut?: boolean | (() => boolean);
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const { targets: placements } = useAgentHostPlacements();
  const { agents, current } = useSheetAgents(placements);
  const sheetModel = useSheetModel(current, agentConfig);
  const name = triggerName(current, sheetModel);
  const closedOutside = useRef(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);
  useKeybinding(openModelSelectorKeyCombination, open, { enabled: enableShortcut });

  const trigger = (
    <Button
      variant='ghost'
      size='sm'
      data-slot='agent-trigger'
      data-chat-textarea-focustrap
      aria-label={`Agent and model: ${name}`}
      aria-keyshortcuts={ariaKeyShortcuts(openModelSelectorKeyCombination)}
      className={cn(ghostPillClass, 'max-w-64 min-w-0 shrink gap-1 pr-2 text-foreground')}
    >
      {sheetModel.glyph}
      <span data-slot='trigger-model' className='min-w-0 truncate text-xs'>
        {sheetModel.name}
      </span>
      {sheetModel.isLevelShown && sheetModel.level ? (
        <span
          data-slot='trigger-level'
          className='shrink-0 text-xs text-muted-foreground group-data-[hide-level]/bar:hidden'
        >
          {sheetModel.level.name}
        </span>
      ) : null}
      {sheetModel.isFast ? <Zap aria-hidden='true' className='size-3 shrink-0 text-muted-foreground' /> : null}
      <ChevronDown aria-hidden='true' className='size-3 shrink-0 text-muted-foreground' />
    </Button>
  );
  const sheet = (
    <Sheet
      agents={agents}
      current={current}
      sheetModel={sheetModel}
      placements={placements}
      agentConfig={agentConfig}
    />
  );
  const onCloseAutoFocus = (event: Event): void => {
    const wasOutside = closedOutside.current;
    closedOutside.current = false;
    if (!wasOutside) {
      event.preventDefault();
      focusEditor();
    }
  };

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent data-chat-textarea-focustrap onCloseAutoFocus={onCloseAutoFocus}>
          <DrawerTitle className='sr-only'>Agent and model</DrawerTitle>
          <DrawerDescription className='sr-only'>
            Choose who runs the next turn, on which model, and how hard it thinks.
          </DrawerDescription>
          <div className='pb-[env(safe-area-inset-bottom)]'>{sheet}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Tooltip>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent
          align='end'
          data-chat-textarea-focustrap
          className='w-80 overflow-hidden p-0'
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusOnOpen(event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
          }}
          onInteractOutside={() => {
            closedOutside.current = true;
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {sheet}
        </PopoverContent>
      </Popover>
      <TooltipContent>
        <span className='flex items-center gap-1.5'>
          {name}
          <KeyShortcut variant='tooltip'>{formatKeyCombination(openModelSelectorKeyCombination)}</KeyShortcut>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
