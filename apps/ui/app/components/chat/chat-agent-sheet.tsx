/**
 * The composer's one agent control: who runs the next turn, on which model,
 * how hard it thinks, and where (D5, Direction 1).
 *
 * The trigger reads as the configuration — the model's glyph (an external
 * agent's own), the model, the level a step lighter, Fast mode, a 12 px
 * chevron. It opens a settings sheet: the chosen model as a row, then
 * Reasoning, the agent's switches and where it runs. The model row drills
 * into the list in the same card; choosing a model returns to the sheet with
 * that model's settings, so a level is only ever set on the model in use.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@taucad/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { IconId } from '#components/icons/svg-icon.js';
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
      readonly name: string;
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
  /** One line under the name: who runs it when there is a choice, and its provider. */
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
const useSheetModel = (current: SheetAgent, agentConfig: AgentConfig, hasChoice: boolean): SheetModel => {
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
      facts: [hasChoice ? 'Tau' : undefined, model.provider.name].filter(Boolean).join(' · '),
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
    facts: [current.name, modelId].filter(Boolean).join(' · '),
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

/**
 * The drilled-in list: agent tabs when there is a choice, search, and the
 * browsed agent's models. Browsing a tab changes nothing until a model is
 * chosen; choosing one on another agent's tab moves the chat to that agent at
 * its own defaults.
 */
function ModelList({
  agents,
  current,
  sheetModel,
  onChoose,
  onBack,
}: {
  readonly agents: readonly SheetAgent[];
  readonly current: SheetAgent;
  readonly sheetModel: SheetModel;
  readonly onChoose: (agent: SheetAgent, modelId: string) => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const {
    model: { modelId },
    execution: { execution },
  } = useChatComposer();
  const { open: openSettings } = useSettingsDialog();
  const [viewKey, setViewKey] = useState(current.key);
  const [query, setQuery] = useState('');
  const view = agents.find((agent) => agent.key === viewKey) ?? current;
  const tauGroups = useTauModelGroups(modelId);
  const selectedAcpModel = execution.kind === 'acp' ? execution.model : undefined;
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Backspace' && query === '') {
      event.preventDefault();
      onBack();
    }
  };

  const list =
    view.kind === 'acp' && view.refusal !== undefined ? (
      <Unavailable agent={{ ...view, refusal: view.refusal }} />
    ) : (
      <Command className='min-h-0 flex-1 bg-transparent' onKeyDown={onKeyDown}>
        <CommandInput
          autoFocus
          placeholder={view.kind === 'tau' ? 'Search models...' : `Search ${view.name} models...`}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className='max-h-none min-h-0 flex-1'>
          <CommandEmpty className='mx-2'>
            {view.kind === 'acp' && view.models.length === 0
              ? `${view.name} offered no models; it runs on its own default.`
              : `No models match “${query}”.`}
          </CommandEmpty>
          {view.kind === 'tau'
            ? tauGroups.map((group) => (
                <CommandGroup key={group.name} heading={group.name}>
                  {group.items.map((entry) => {
                    const isInUse = current.kind === 'tau' && entry.id === modelId;
                    return (
                      <CommandItem
                        key={entry.id}
                        value={entry.id}
                        keywords={[entry.name, entry.provider.name, group.name]}
                        onSelect={() => {
                          onChoose(view, entry.id);
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
            : view.models.length > 0 && (
                <CommandGroup heading={view.name}>
                  {view.models.map((entry) => {
                    const isInUse = current.key === view.key && entry.id === (selectedAcpModel ?? view.defaultModel);
                    return (
                      <CommandItem
                        key={entry.id}
                        value={entry.id}
                        keywords={[entry.name, view.name]}
                        onSelect={() => {
                          onChoose(view, entry.id);
                        }}
                      >
                        {/* Agent-authored text: rendered as text, never resolved against Tau's catalog (VI3). */}
                        <ModelRow
                          glyph={<AgentGlyph agentId={view.agentId} className='size-4' />}
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
        {view.kind === 'tau' ? (
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

  return agents.length > 1 ? (
    <Tabs
      value={view.key}
      className='min-h-0 flex-1 gap-0'
      onValueChange={(key) => {
        setViewKey(key);
        setQuery('');
      }}
    >
      <div className='px-1 pt-1'>
        <TabsList
          aria-label='Agent'
          activeClassName='hidden'
          className='w-full gap-0.5 p-0.5 data-[orientation=horizontal]:flex data-[orientation=horizontal]:min-h-7'
        >
          {agents.map((agent) => {
            const isInUse = agent.key === current.key;
            const isRefused = agent.kind === 'acp' && agent.refusal !== undefined;
            return (
              <TabsTrigger
                key={agent.key}
                value={agent.key}
                aria-label={[agent.name, isInUse ? 'in use' : undefined, isRefused ? 'unavailable' : undefined]
                  .filter(Boolean)
                  .join(', ')}
                className={cn(
                  'h-full w-auto min-w-0 flex-auto gap-1.5 rounded-sm border border-transparent px-2 text-xs font-normal text-muted-foreground dark:text-muted-foreground',
                  'hover:bg-menu-highlight hover:text-foreground',
                  'data-[state=active]:border-border data-[state=active]:bg-accent data-[state=active]:text-foreground dark:data-[state=active]:text-foreground',
                )}
              >
                {agent.kind === 'tau' ? (
                  <Bot aria-hidden='true' className='size-3.5 shrink-0' />
                ) : (
                  <AgentGlyph agentId={agent.agentId} className={cn('size-3.5 shrink-0', isRefused && 'opacity-50')} />
                )}
                <span className='truncate'>{agent.name}</span>
                {isRefused ? (
                  <CircleAlert className='size-3 shrink-0' aria-hidden='true' />
                ) : isInUse ? (
                  <Check className='size-3 shrink-0' aria-hidden='true' />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <TabsContent value={view.key} className='flex min-h-0 flex-col'>
        {list}
      </TabsContent>
    </Tabs>
  ) : (
    <div className='flex min-h-0 flex-1 flex-col'>{list}</div>
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
  const [view, setView] = useState<'settings' | 'models'>('settings');
  const hasNavigated = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hasNavigated.current && view === 'settings') {
      focusOnOpen(surfaceRef.current ?? undefined);
    }
  }, [view]);
  const go = (next: 'settings' | 'models'): void => {
    hasNavigated.current = true;
    setView(next);
  };

  const choose = (agent: SheetAgent, modelId: string): void => {
    if (agent.kind === 'tau') {
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
      const next: AcpAgentExecution = isSameAgent
        ? { ...execution, model: modelId }
        : { kind: 'acp', hostId: agent.hostId, agentId: agent.agentId, model: modelId };
      setActiveExecution(next);
    }
    go('settings');
  };

  const reasoningLabel = `Reasoning for ${current.kind === 'acp' ? `${current.name} ` : ''}${sheetModel.name}`;
  return (
    <div ref={surfaceRef} data-slot='agent-sheet' className='w-full overflow-hidden'>
      {view === 'settings' ? (
        <div
          data-slot='sheet-settings'
          className='flex flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2'
        >
          <button
            type='button'
            data-slot='sheet-model'
            aria-label={`Model: ${current.kind === 'acp' ? `${current.name}, ` : ''}${sheetModel.name}. Change`}
            className={cn(
              menuItemVariants({ highlight: 'focus' }),
              'm-1 h-auto w-[calc(100%-0.5rem)] gap-2.5 px-2.5 py-2 hover:bg-menu-highlight',
            )}
            onClick={() => {
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
          data-slot='sheet-models'
          className='flex h-[25rem] max-h-[70vh] flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2'
        >
          <div className='flex h-9 shrink-0 items-center gap-1 border-b px-1'>
            <Button
              variant='ghost'
              size='sm'
              aria-label='Back to settings'
              className='h-7 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground'
              onClick={() => {
                go('settings');
              }}
            >
              <ChevronLeft aria-hidden='true' className='size-4' />
              {sheetModel.name}
            </Button>
          </div>
          <ModelList
            agents={agents}
            current={current}
            sheetModel={sheetModel}
            onChoose={choose}
            onBack={() => {
              go('settings');
            }}
          />
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
  const sheetModel = useSheetModel(current, agentConfig, agents.length > 1);
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
