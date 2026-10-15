import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Circle, CircleAlert, Hand, LoaderCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import { cn } from '@taucad/ui/utils/cn';
import { disclosureMotion } from '@taucad/ui/components/actions';
import { formatFieldLabel } from '@taucad/ui/utils/label';
import { rjsfValidator } from '@taucad/viewer/parameters/rjsf-validator';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';

/** A draft-7 schema and the defaults its owner declares. @public */
export type ResolvedSchema = Readonly<{ schema: JSONSchema7; defaults: Record<string, unknown> }>;

/**
 * What a form still needs before its values may be sent: the top-level fields its schema finds wanting.
 *
 * @param schema - The form's draft-7 schema.
 * @param values - The values as they would be sent.
 * @returns A sentence naming those fields, or nothing when the values are complete.
 * @public
 */
export const formIncomplete = (schema: JSONSchema7, values: Record<string, unknown>): string | undefined => {
  const { errors } = rjsfValidator.validateFormData(values, schema);
  if (errors.length === 0) {
    return undefined;
  }
  /* Each field an error lies in; an error on the whole form only summarises those. */
  const labels = new Set(
    errors.flatMap(({ property }) => {
      const segment = /^\[("(?:[^"\\]|\\.)*")\]/u.exec(property ?? '')?.[1];
      if (segment === undefined) {
        return [];
      }
      const key = JSON.parse(segment) as string;
      const field = schema.properties?.[key];
      const title = typeof field === 'object' ? field.title : undefined;
      return [formatFieldLabel(title ?? key, title)];
    }),
  );
  return `Complete ${labels.size === 0 ? 'the form' : [...labels].join(', ')} first.`;
};

/**
 * Compile a provider configuration schema into the parameter manifest the
 * shared Parameters renderer needs (blueprint R4). The declared defaults keep
 * the manifest stable across telemetry; observed defaults go to the form.
 *
 * @param provider - The provider or route the schema belongs to.
 * @param configuration - The configuration name inside that provider.
 * @param resolved - The draft-7 schema and its declared defaults.
 * @returns The manifest once compiled for the current schema.
 * @public
 */
export const useCompiledConfigurationManifest = (
  provider: string | undefined,
  configuration: string,
  resolved: ResolvedSchema | undefined,
): ParameterManifest | undefined => {
  const [compiled, setCompiled] = useState<{
    readonly resolved: ResolvedSchema;
    readonly manifest: ParameterManifest;
  }>();
  useEffect(() => {
    if (!provider || !resolved) {
      return;
    }
    let cancelled = false;
    const compile = async (): Promise<void> => {
      try {
        const { manifest } = await compileExportConfigurationManifest(provider, configuration, resolved);
        if (!cancelled) {
          setCompiled({ resolved, manifest });
        }
      } catch (error) {
        /* The form stays in its preparing state; what depends on it uses the values entered so far. */
        console.error(`[print] Could not compile the ${configuration} form for ${provider}.`, error);
      }
    };
    // async-iife: bootstrap -- the manifest is derived from the schema; a newer schema simply supersedes this compile.
    void compile();
    return () => {
      cancelled = true;
    };
  }, [configuration, provider, resolved]);
  return compiled !== undefined && compiled.resolved === resolved ? compiled.manifest : undefined;
};

/**
 * A clock that ticks once a second while mounted, for ages and staleness.
 *
 * @returns Milliseconds since the epoch, refreshed every second.
 * @public
 */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);
  return now;
};

/** Arrow keys move between stage headers, as in an accordion; Home and End go to the first and last. */
const stageKeys: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * The pane's stages in one frame: adjoined rows split by rules, as the revision pane's file list is
 * (DESIGN, frame peers once). Each child is a {@link PrintStage}.
 *
 * @param properties - The stages.
 * @returns The frame.
 */
export function PrintStages({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      data-slot='print-stages'
      className='flex min-w-0 shrink-0 flex-col divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-background'
      onKeyDown={(event) => {
        const move = stageKeys[event.key];
        if (move === undefined || !(event.target instanceof HTMLElement) || !event.target.dataset['printStage']) {
          return;
        }
        const triggers = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-print-stage]')];
        event.preventDefault();
        triggers[move(triggers.indexOf(event.target), triggers.length)]?.focus();
      }}
    >
      {children}
    </div>
  );
}

/**
 * One stage of the pane: a header row that opens it, saying what is inside while it is closed.
 * It opens by default as its owner says; once a person toggles it, their choice stays.
 *
 * @param properties - The stage's glyph, title, summary, an optional control beside the trigger,
 * whether it starts open and the body.
 * @returns The stage.
 */
export function PrintStage({
  icon: Icon,
  title,
  summary,
  aside,
  isDefaultOpen = false,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  /** What the closed stage would show, in a few words; hidden while it is open. */
  readonly summary?: React.ReactNode;
  /** Beside the trigger, never inside it: a reset is a button of its own. */
  readonly aside?: React.ReactNode;
  readonly isDefaultOpen?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [toggled, setToggled] = useState<boolean>();
  return (
    <Collapsible asChild open={toggled ?? isDefaultOpen} onOpenChange={setToggled}>
      <section aria-label={title} className='group/stage flex min-w-0 flex-col'>
        <div className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 transition-colors hover:bg-accent/50 motion-reduce:transition-none'>
          <CollapsibleTrigger
            data-print-stage={title}
            className='col-span-2 col-start-1 row-start-1 grid min-h-9 min-w-0 cursor-action grid-cols-subgrid items-center gap-x-2 px-2.5 text-left text-xs focus-visible:focus-outline'
          >
            <span className='flex items-center gap-2'>
              <Icon aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
              <span className='shrink-0 font-medium'>{title}</span>
            </span>
            <span className='flex min-w-0 items-center gap-2'>
              {/* Reserve space beside the title for the sibling reset button. */}
              {aside === undefined ? null : <span aria-hidden className='size-4 shrink-0' />}
              <span className='min-w-0 flex-1 truncate text-right text-muted-foreground tabular-nums group-data-[state=open]/stage:invisible'>
                {summary}
              </span>
              <ChevronDown
                aria-hidden
                className='size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/stage:rotate-180 motion-reduce:transition-none'
              />
            </span>
          </CollapsibleTrigger>
          {aside === undefined ? null : (
            <div className='relative col-start-2 row-start-1 flex items-center justify-self-start'>{aside}</div>
          )}
        </div>
        <CollapsibleContent className={disclosureMotion}>
          {/* Padding sits inside the animated content, so the height animation starts without a jump. */}
          <div className='flex min-w-0 flex-col gap-3 border-t border-border/70 px-2.5 pt-2.5 pb-3'>{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/**
 * A section that starts folded: engineering detail on request.
 *
 * @param properties - Heading, optional summary beside it, an optional control after the trigger,
 * initial state and the body.
 * @returns The disclosure.
 */
export function PrintDisclosure({
  title,
  summary,
  aside,
  isDefaultOpen = false,
  children,
}: {
  readonly title: string;
  readonly summary?: string;
  /** Beside the trigger, never inside it: a reset is a button of its own. */
  readonly aside?: React.ReactNode;
  readonly isDefaultOpen?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    // The 32 px trigger overhangs its text by 8 px; pt-1 and -mb-2 keep the rule rhythm at 12 px.
    <Collapsible
      defaultOpen={isDefaultOpen}
      className='-mb-2 border-t border-border/70 pt-1 first:border-t-0 first:pt-0'
    >
      <div className='flex min-w-0 items-center gap-1'>
        <CollapsibleTrigger className='group/disclosure flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-accent/50'>
          <ChevronRight
            aria-hidden
            className='size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/disclosure:rotate-90 motion-reduce:transition-none'
          />
          {/* The title keeps its width; a long summary truncates instead. */}
          <span className='shrink-0 text-xs font-medium text-muted-foreground'>{title}</span>
          <span className='min-w-0 flex-1 truncate text-right text-xs text-muted-foreground'>{summary}</span>
        </CollapsibleTrigger>
        {aside}
      </div>
      <CollapsibleContent className='flex flex-col gap-2 pb-2'>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A label/value pair on one line; values wrap and use tabular numerals.
 *
 * @param properties - The label, the value and an optional trailing badge.
 * @returns The row.
 */
export function PrintRow({
  label,
  children,
  badge,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly badge?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs'>
      <dt className='min-w-24 text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 flex-1 break-words tabular-nums'>{children}</dd>
      {badge}
    </div>
  );
}

/**
 * A recoverable failure or a decision, kept outside any fold (DESIGN, never fold away a decision).
 *
 * @param properties - The tone and the message.
 * @returns The notice.
 */
export function PrintNotice({
  tone,
  children,
  role = 'alert',
}: {
  readonly tone: 'warning' | 'error' | 'neutral';
  readonly children: React.ReactNode;
  readonly role?: 'alert' | 'status';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-lg border p-2 text-xs',
        tone === 'warning' && 'border-warning/30 bg-warning/10',
        tone === 'error' && 'border-feature/30 bg-feature/10',
        tone === 'neutral' && 'border-border/70 bg-muted/30',
      )}
    >
      <CircleAlert
        aria-hidden
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          tone === 'warning' && 'text-warning',
          tone === 'error' && 'text-feature',
          tone === 'neutral' && 'text-muted-foreground',
        )}
      />
      <div className='min-w-0 flex-1 break-words'>{children}</div>
    </div>
  );
}

/**
 * The "Stale" mark a monitor group wears when its observation is older than its budget.
 *
 * @returns The badge.
 */
export function StaleBadge(): React.JSX.Element {
  return (
    <span className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
      <CircleAlert aria-hidden className='size-3 text-warning' />
      Stale
    </span>
  );
}

/** One step of a send or a filament change, as `PrintSteps` lists it. @public */
export type PrintStep = Readonly<{
  label: string;
  state: 'done' | 'active' | 'todo' | 'skipped';
  /** Who takes the step: while it is active, a step for the person shows a hand instead of a spinner. */
  actor?: 'machine' | 'person';
}>;

const stepStateWords = { done: 'done', active: 'in progress', todo: 'to do', skipped: 'skipped' } as const;

/**
 * Something in progress as its steps, in order: what is done, the step in progress and what follows. Sends and
 * filament changes share it, so the pane reads progress one way everywhere.
 *
 * @param properties - The steps and how they flow.
 * @returns The list.
 * @public
 */
export function PrintSteps({
  steps,
  layout = 'inline',
}: {
  readonly steps: readonly PrintStep[];
  /** `inline` wraps a few short steps; `list` stacks longer ones. */
  readonly layout?: 'inline' | 'list';
}): React.JSX.Element {
  return (
    <ol
      className={cn(
        'flex text-xs text-muted-foreground',
        layout === 'inline' ? 'flex-wrap gap-x-3 gap-y-1' : 'flex-col gap-1',
      )}
    >
      {steps.map((step) => {
        const needsPerson = step.state === 'active' && step.actor === 'person';
        return (
          <li
            key={step.label}
            aria-current={step.state === 'active' ? 'step' : undefined}
            className={cn(
              'flex min-w-0 items-center gap-1',
              step.state !== 'todo' && step.state !== 'skipped' && 'text-foreground',
              step.state === 'skipped' && 'line-through',
              needsPerson && 'font-medium',
            )}
          >
            {step.state === 'done' ? (
              <Check aria-hidden className='size-3 shrink-0 text-success' />
            ) : needsPerson ? (
              <Hand aria-hidden className='size-3 shrink-0 text-information' />
            ) : step.state === 'active' ? (
              <LoaderCircle aria-hidden className='size-3 shrink-0 animate-spin motion-reduce:animate-none' />
            ) : (
              <Circle aria-hidden className='size-3 shrink-0' />
            )}
            <span className='min-w-0'>{step.label}</span>
            <span className='sr-only'> ({needsPerson ? 'needs you' : stepStateWords[step.state]})</span>
          </li>
        );
      })}
    </ol>
  );
}
