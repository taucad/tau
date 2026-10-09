import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  Crosshair,
  Hand,
  House,
  LoaderCircle,
  Move,
  OctagonX,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { componentValue, fffProcessOf, machineActionOf } from '@taucad/runtime/machine';
import type {
  MachineActionDescriptor,
  MachineActivity,
  MachineAxis,
  MachineClient,
  MachineComponent,
  MachineDirectoryEntry,
  MachineHoldDescriptor,
  MachineRemedy,
} from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { cn } from '@taucad/ui/utils/cn';
import { isRecord } from '@taucad/utils/schema';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { describeOutcome, failureCodeOf } from '#components/print/machine-facts.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import {
  PrintNotice,
  PrintRow,
  PrintStage,
  PrintSteps,
  useNow,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatAge } from '#routes/w.$workspace.$project/chat-print-summary.js';

/** Statuses in which a run owns the machine: motion, tools and the spindle stay with it. */
const runOwnedStates: ReadonlySet<string> = new Set(['starting', 'running', 'paused', 'finishing']);

/**
 * Whether a run owns the machine now.
 *
 * @param entry - The machine as observed.
 * @returns True while a run is starting, running, paused or finishing.
 * @public
 */
export const isRunOwned = (entry: MachineDirectoryEntry): boolean =>
  runOwnedStates.has(entry.snapshot.run?.state ?? '');

/**
 * The installed descriptor of an action, when the machine declares it.
 *
 * @param entry - The machine as observed.
 * @param componentId - The component.
 * @param action - The action id.
 * @returns The descriptor, or nothing.
 * @public
 */
export const declaredAction = (
  entry: MachineDirectoryEntry,
  componentId: string,
  action: string,
): MachineActionDescriptor | undefined => {
  const descriptor = machineActionOf(entry, { componentId, action });
  return descriptor !== undefined && 'scope' in descriptor ? descriptor : undefined;
};

/** A schema keyword's list, or none. */
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/**
 * The JSON Schema of one parameter in a control's form; for a form of alternatives (`spindle.set`), the first branch
 * that declares it.
 *
 * @param descriptor - The action or hold.
 * @param name - The parameter.
 * @returns The parameter's schema, or nothing when the form does not name it.
 * @public
 */
export const formParameter = (
  descriptor: MachineActionDescriptor | MachineHoldDescriptor | undefined,
  name: string,
): Record<string, unknown> | undefined => {
  const schema: unknown = descriptor?.configuration.legacyProjection.inputSchema;
  if (!isRecord(schema)) {
    return undefined;
  }
  const branches = [schema, ...listOf(schema['oneOf']), ...listOf(schema['anyOf'])];
  for (const branch of branches) {
    const property = isRecord(branch) && isRecord(branch['properties']) ? branch['properties'][name] : undefined;
    if (isRecord(property)) {
      return property;
    }
  }
  return undefined;
};

/**
 * A number for one parameter from the control's form: its default, else the pane's choice kept inside the form's
 * bounds.
 *
 * @param descriptor - The action or hold.
 * @param name - The parameter.
 * @param preferred - What the pane sends when the form declares no default.
 * @returns The value to send.
 * @public
 */
export const formNumber = (
  descriptor: MachineActionDescriptor | MachineHoldDescriptor | undefined,
  name: string,
  preferred: number,
): number => {
  const property = formParameter(descriptor, name);
  if (typeof property?.['default'] === 'number') {
    return property['default'];
  }
  const maximum = typeof property?.['maximum'] === 'number' ? property['maximum'] : Number.POSITIVE_INFINITY;
  const minimum = typeof property?.['minimum'] === 'number' ? property['minimum'] : Number.NEGATIVE_INFINITY;
  return Math.min(maximum, Math.max(minimum, preferred));
};

/**
 * The choices one parameter's form offers: `oneOf` constants with their titles, or an `enum`.
 *
 * @param descriptor - The action.
 * @param name - The parameter.
 * @returns Value and label pairs; none when the form offers no fixed choices.
 * @public
 */
export const formChoices = (
  descriptor: MachineActionDescriptor | undefined,
  name: string,
): ReadonlyArray<Readonly<{ value: string; label: string }>> => {
  const property = formParameter(descriptor, name);
  if (Array.isArray(property?.['oneOf'])) {
    return property['oneOf'].flatMap((choice) =>
      isRecord(choice) && typeof choice['const'] === 'string'
        ? [{ value: choice['const'], label: typeof choice['title'] === 'string' ? choice['title'] : choice['const'] }]
        : [],
    );
  }
  return Array.isArray(property?.['enum'])
    ? property['enum'].filter((value) => typeof value === 'string').map((value) => ({ value, label: value }))
    : [];
};

/**
 * The marks a control wears: "Unqualified" while it is designed but tried under testing.
 *
 * @param properties - The descriptor.
 * @returns The badge, or nothing for a qualified control.
 * @public
 */
export function QualificationBadge({
  descriptor,
}: {
  readonly descriptor: MachineActionDescriptor | MachineHoldDescriptor | undefined;
}): React.JSX.Element | undefined {
  return descriptor?.qualification.status === 'designed' ? (
    <Badge
      variant='outline'
      className='ml-0.5 px-1 py-0 text-[0.625rem]'
      title='Not yet qualified on this machine; usable because testing is on.'
    >
      Unqualified
    </Badge>
  ) : undefined;
}

/**
 * A button for one declared action: absent when the machine does not declare it, disabled with the check's reason
 * while it cannot be used, and sent through the control's one path when pressed.
 *
 * @param properties - The control, the action, its parameters and how it looks.
 * @returns The button, or nothing.
 * @public
 */
export function ActionButton({
  control,
  componentId,
  action,
  parameters = {},
  label,
  icon: Icon,
  variant = 'outline',
  ariaLabel,
  onDone,
}: {
  readonly control: MachineControl;
  readonly componentId: string;
  readonly action: string;
  readonly parameters?: unknown;
  readonly label?: string;
  readonly icon?: LucideIcon;
  readonly variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  readonly ariaLabel?: string;
  /** Called with whether the machine accepted it. */
  readonly onDone?: (isAccepted: boolean) => void;
}): React.JSX.Element | undefined {
  const descriptor = declaredAction(control.entry, componentId, action);
  if (descriptor === undefined) {
    return undefined;
  }
  const check = control.check(componentId, action);
  const isPending = control.pending === `${componentId}:${action}`;
  return (
    <Button
      type='button'
      size='sm'
      variant={variant}
      aria-label={ariaLabel}
      disabled={check.status !== 'available' || control.pending !== undefined}
      title={check.status === 'unavailable' ? check.message : descriptor.consequence}
      onClick={() => {
        const send = async (): Promise<void> => {
          const isAccepted = await control.apply(componentId, action, parameters);
          onDone?.(isAccepted);
        };
        // async-iife: press -- the control reports its own refusal.
        void send();
      }}
    >
      {isPending ? (
        <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
      ) : Icon === undefined ? null : (
        <Icon aria-hidden />
      )}
      {label ?? descriptor.label}
      <QualificationBadge descriptor={descriptor} />
    </Button>
  );
}

/**
 * The id of a machine's Stop control in the pane's header, so a `stop` remedy can lead to it.
 *
 * @param machineId - The machine.
 * @returns The element id.
 * @public
 */
export const stopControlId = (machineId: string): string => `machine-stop-${machineId}`;

/**
 * What clears a refusal: an action remedy is its own button, a person's remedy is an instruction, and a `stop`
 * remedy says what Stop costs with a link to the pane's one Stop control, never a second Stop.
 *
 * @param properties - The control and the remedy.
 * @returns The remedy.
 * @public
 */
export function RemedyButton({
  control,
  remedy,
}: {
  readonly control: MachineControl;
  readonly remedy: MachineRemedy;
}): React.JSX.Element | undefined {
  if (remedy.type === 'person') {
    return (
      <p className='flex items-start gap-1.5 text-xs'>
        <Hand aria-hidden className='mt-0.5 size-3 shrink-0 text-information' />
        <span>At the machine: {remedy.instruction}</span>
      </p>
    );
  }
  if (remedy.type === 'stop') {
    return (
      <p className='flex flex-wrap items-baseline gap-x-1.5 text-xs'>
        <OctagonX aria-hidden className='size-3 shrink-0 self-center text-destructive' />
        {/* ponytail: Stop is in the header whenever something can be stopped, which a stop remedy implies. */}
        <Button
          type='button'
          variant='link'
          size='xs'
          className='h-auto p-0'
          onClick={() => {
            /* An attribute selector, as a machine id may hold characters an `#id` selector reads as syntax. */
            document
              .querySelector<HTMLElement>(`[id=${JSON.stringify(stopControlId(control.entry.machineId))}]`)
              ?.focus();
          }}
        >
          Go to Stop
        </Button>
        <span>{remedy.consequence}</span>
      </p>
    );
  }
  return <ActionButton control={control} componentId={remedy.componentId} action={remedy.action} />;
}

/**
 * Whether the pane asks "I am at the machine" once, above everything: only where starting a job needs someone there.
 * Elsewhere a control that needs someone watching asks beside itself, when it is used.
 *
 * @param entry - The machine as observed.
 * @returns True when the machine's job start is attended.
 * @public
 */
export const asksPresenceAtPane = (entry: MachineDirectoryEntry): boolean => {
  const { jobs } = entry.descriptor.capabilities;
  return jobs.type === 'supported' && jobs.safety.attended;
};

/**
 * "I am at the machine" beside the controls that need it, on a machine whose pane does not ask above. It sets the
 * same presence the pane would, so the request carries it the same way.
 *
 * @param properties - The control.
 * @returns The switch.
 */
function InlinePresence({ control }: { readonly control: MachineControl }): React.JSX.Element {
  return (
    <div className='-my-1.5 flex min-w-0 flex-col'>
      <PrintSetupRow
        label='I am at the machine'
        description={
          control.attended
            ? 'Tau asks again after 10 minutes without a control being used.'
            : 'These controls need someone who can see the machine.'
        }
      >
        <ParametersBoolean aria-label='I am at the machine' value={control.attended} onChange={control.setAttended} />
      </PrintSetupRow>
    </div>
  );
}

/**
 * Why a group of controls cannot act now, with the way out, said once above the group. Where the group's action
 * needs someone watching and the pane does not ask, "I am at the machine" is asked here instead of the refusal.
 *
 * @param properties - The control, the action that speaks for the group, and whether to show its remedy.
 * @returns The line, or nothing while the action is available or undeclared.
 * @public
 */
export function Blocked({
  control,
  componentId,
  action,
  kind = 'action',
  hasRemedy = true,
}: {
  readonly control: MachineControl;
  readonly componentId: string;
  readonly action: string;
  readonly kind?: 'action' | 'hold';
  /** Off where the group already shows the remedy's own button. */
  readonly hasRemedy?: boolean;
}): React.JSX.Element | undefined {
  const check = control.check(componentId, action, kind);
  const asksHere =
    machineActionOf(control.entry, { componentId, action, kind })?.safety.attended === true &&
    !asksPresenceAtPane(control.entry);
  const isReasonShown =
    check.status === 'unavailable' &&
    check.code !== 'MACHINE_ACTION_UNDECLARED' &&
    !(asksHere && check.code === 'MACHINE_ACTION_ATTENDANCE_REQUIRED');
  return (
    <>
      {isReasonShown ? (
        <div className='flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <CircleAlert aria-hidden className='size-3.5 shrink-0 text-warning' />
          <span className='min-w-0 flex-1'>{check.message}</span>
          {check.remedy === undefined || !hasRemedy ? null : <RemedyButton control={control} remedy={check.remedy} />}
        </div>
      ) : null}
      {asksHere ? <InlinePresence control={control} /> : null}
    </>
  );
}

/**
 * What each declared control in a group does on this machine, said before it is pressed.
 *
 * @param properties - The descriptors the group offers.
 * @returns The lines, or nothing when none declares a consequence.
 * @public
 */
export function Consequences({
  descriptors,
}: {
  readonly descriptors: ReadonlyArray<MachineActionDescriptor | undefined>;
}): React.JSX.Element | undefined {
  const lines = descriptors.flatMap((descriptor) =>
    descriptor?.consequence === undefined && descriptor?.outcome === undefined
      ? []
      : [
          {
            key: `${descriptor.componentId}:${descriptor.id}`,
            text: [
              descriptor.consequence,
              descriptor.outcome === undefined ? undefined : describeOutcome(descriptor.outcome),
            ]
              .filter((part) => part !== undefined)
              .join(' '),
            label: descriptor.label,
          },
        ],
  );
  if (lines.length === 0) {
    return undefined;
  }
  return (
    <ul className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
      {lines.map((line) => (
        <li key={line.key}>
          <span className='font-medium text-foreground'>{line.label}:</span> {line.text}
        </li>
      ))}
    </ul>
  );
}

const group = (title: string, children: React.ReactNode): React.JSX.Element => (
  <div role='group' aria-label={title} className='flex min-w-0 flex-col gap-2'>
    <h4 className='text-xs font-medium text-muted-foreground'>{title}</h4>
    {children}
  </div>
);

type MotionComponent = Extract<MachineComponent, { kind: 'motion' }>;

const jogSteps = ['0.1', '1', '10', 'hold'] as const;
type JogStep = (typeof jogSteps)[number];
/** Millimetres per minute a jog from the pane asks for when the form declares no default. */
const preferredJogFeed = 1000;

/**
 * The pad, in the direction each arrow shows. Z's arrows show what moves vertically: on a machine whose bed rides Z
 * (the X1C), the up arrow raises the bed, which is Z− in machine coordinates, as in Bambu Studio.
 */
const jogButtons = [
  { axis: 'y', direction: 1, icon: ArrowUp, area: 'col-start-2 row-start-1', isBeforeHome: true },
  { axis: 'x', direction: -1, icon: ArrowLeft, area: 'col-start-1 row-start-2', isBeforeHome: true },
  { axis: 'x', direction: 1, icon: ArrowRight, area: 'col-start-3 row-start-2', isBeforeHome: false },
  { axis: 'y', direction: -1, icon: ArrowDown, area: 'col-start-2 row-start-3', isBeforeHome: false },
  { axis: 'z', direction: 1, icon: ChevronsUp, area: 'row-start-1', isBeforeHome: true },
  { axis: 'z', direction: -1, icon: ChevronsDown, area: 'row-start-3', isBeforeHome: false },
] as const;

/** One square cell of the pad: an icon over its axis label. */
const jogCell = 'size-11 flex-col gap-0 font-mono text-[0.625rem]';

/**
 * The jog pad as studios lay it out (Bambu Studio, OctoPrint, Mainsail): an XY cross with Home in its centre, Z in its
 * own column beside it, and the step as a segmented control. One step per press, or press and hold, which moves only
 * while held and renews its lease every half lease until released.
 *
 * @param properties - The control, the motion component and its axes.
 * @returns The pad.
 */
function JogPad({
  control,
  motion,
  axes,
}: {
  readonly control: MachineControl;
  readonly motion: MotionComponent;
  readonly axes: readonly MachineAxis[];
}): React.JSX.Element {
  const declaredHold = machineActionOf(control.entry, { componentId: motion.id, action: 'motion.jog', kind: 'hold' });
  const holdDescriptor = declaredHold !== undefined && 'lease' in declaredHold ? declaredHold : undefined;
  const stepDescriptor = declaredAction(control.entry, motion.id, 'motion.jog');
  const steps = jogSteps.filter((step) => step !== 'hold' || holdDescriptor !== undefined);
  const [step, setStep] = useState<JogStep>('1');
  const isHold = step === 'hold';
  const check = control.check(motion.id, 'motion.jog', isHold ? 'hold' : 'action');
  const isEnabled = check.status === 'available';
  const jogFeed = formNumber(isHold ? holdDescriptor : stepDescriptor, 'feed', preferredJogFeed);
  const present = new Set(axes.map((axis) => axis.id));
  const isBedOnZ = axes.find((axis) => axis.id === 'z')?.carries === 'work';
  const home = declaredAction(control.entry, motion.id, 'motion.home');
  const homeCheck = control.check(motion.id, 'motion.home');
  const end = (): void => {
    if (isHold) {
      control.endHold();
    }
  };
  const button = ({ axis, direction: shown, icon: Icon, area }: (typeof jogButtons)[number]): React.JSX.Element => {
    const isBed = axis === 'z' && isBedOnZ;
    const direction = isBed ? (shown === 1 ? -1 : 1) : shown;
    const label = `${axis.toUpperCase()}${direction > 0 ? '+' : '−'}`;
    const begin = (): void => {
      if (isEnabled && isHold) {
        control.beginHold(motion.id, { axis, direction, feed: jogFeed });
      }
    };
    return (
      <Button
        key={label}
        type='button'
        size='icon-lg'
        variant='outline'
        aria-label={isBed ? `Jog ${label}, bed ${shown > 0 ? 'up' : 'down'}` : `Jog ${label}`}
        aria-pressed={
          isHold ? control.hold?.parameters.axis === axis && control.hold.parameters.direction === direction : undefined
        }
        /* The button whose hold is in force stays live: a disabled button may never see its own release. */
        disabled={!isEnabled && control.hold === undefined}
        className={cn(jogCell, area)}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onBlur={end}
        onKeyDown={(event) => {
          if ((event.key === ' ' || event.key === 'Enter') && isHold) {
            event.preventDefault();
            if (!event.repeat) {
              begin();
            }
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            end();
          }
        }}
        onClick={() => {
          if (!isHold) {
            void control.apply(motion.id, 'motion.jog', {
              axis,
              distance: Number(step) * direction,
              feed: jogFeed,
            });
          }
        }}
      >
        <Icon aria-hidden />
        {label}
      </Button>
    );
  };
  const planar = jogButtons.filter((jog) => jog.axis !== 'z' && present.has(jog.axis));
  const vertical = jogButtons.filter((jog) => jog.axis === 'z' && present.has(jog.axis));
  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <PrintSetupRow label='Jog' reading='mm'>
        <QualificationBadge descriptor={isHold ? holdDescriptor : stepDescriptor} />
        <ToggleGroup
          type='single'
          variant='outline'
          size='sm'
          aria-label='Jog step'
          value={step}
          onValueChange={(value) => {
            const chosen = jogSteps.find((candidate) => candidate === value);
            if (chosen !== undefined) {
              setStep(chosen);
            }
          }}
        >
          {steps.map((key) => (
            <ToggleGroupItem
              key={key}
              value={key}
              aria-label={key === 'hold' ? 'Hold to jog' : `${key} mm`}
              className='px-2.5 font-mono text-xs'
            >
              {key === 'hold' ? 'Hold' : key}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PrintSetupRow>
      <div className='flex items-start justify-center gap-6'>
        {planar.length > 0 || home !== undefined ? (
          <div className='grid grid-cols-3 grid-rows-3 gap-1.5' role='group' aria-label='Jog X and Y'>
            {/* Reading order follows the cross: Y+, X−, Home, X+, Y−. */}
            {planar.filter((jog) => jog.isBeforeHome).map((jog) => button(jog))}
            {home === undefined ? null : (
              <Button
                type='button'
                size='icon-lg'
                variant='secondary'
                aria-label={home.label}
                title={homeCheck.status === 'unavailable' ? homeCheck.message : home.consequence}
                disabled={homeCheck.status !== 'available' || control.pending !== undefined}
                className={cn(jogCell, 'col-start-2 row-start-2 font-sans')}
                onClick={() => {
                  void control.apply(motion.id, 'motion.home', {});
                }}
              >
                {control.pending === `${motion.id}:motion.home` ? (
                  <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
                ) : (
                  <House aria-hidden />
                )}
                Home
              </Button>
            )}
            {planar.filter((jog) => !jog.isBeforeHome).map((jog) => button(jog))}
          </div>
        ) : null}
        {vertical.length > 0 ? (
          <div className='grid grid-rows-3 gap-1.5' role='group' aria-label={isBedOnZ ? 'Move the bed' : 'Jog Z'}>
            {vertical.map((jog) => button(jog))}
            <span className='row-start-2 flex items-center justify-center text-xs text-muted-foreground'>
              {isBedOnZ ? 'Bed' : 'Z'}
            </span>
          </div>
        ) : null}
      </div>
      {isHold && holdDescriptor !== undefined ? (
        <p className='text-xs text-muted-foreground'>
          Moves only while pressed. If this window stops renewing the hold, the machine stops by itself within{' '}
          {holdDescriptor.bound} ms.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Motion: unlock, wake, home, go to work zero, the jog pad and zeroing the work offset at the current position.
 *
 * @param properties - The control and the motion component.
 * @returns The group, or nothing when the machine declares no motion control.
 */
function MotionGroup({
  control,
  motion,
}: {
  readonly control: MachineControl;
  readonly motion: MotionComponent;
}): React.JSX.Element | undefined {
  const { entry } = control;
  const has = (componentId: string, action: string): boolean =>
    declaredAction(entry, componentId, action) !== undefined;
  const controllerId =
    entry.descriptor.capabilities.components.find((component) => component.kind === 'controller')?.id ?? 'controller';
  const hasJog =
    has(motion.id, 'motion.jog') ||
    machineActionOf(entry, { componentId: motion.id, action: 'motion.jog', kind: 'hold' }) !== undefined;
  const offered = [
    has(controllerId, 'controller.unlock'),
    has(controllerId, 'controller.wake'),
    has(motion.id, 'motion.home'),
    has(motion.id, 'motion.move'),
    hasJog,
    has(motion.id, 'work-offset.set'),
  ];
  if (!offered.some(Boolean)) {
    return undefined;
  }
  const axes = entry.descriptor.capabilities.axes.filter(
    (axis) => motion.axes.includes(axis.id) && axis.kind === 'linear',
  );
  const offset = componentValue(entry.snapshot.components, motion.id, 'motion')?.workOffset.id;
  return group(
    'Motion',
    <>
      {hasJog ? <Blocked control={control} componentId={motion.id} action='motion.jog' hasRemedy={false} /> : null}
      <div className='flex flex-wrap gap-2'>
        <ActionButton control={control} componentId={controllerId} action='controller.unlock' />
        <ActionButton control={control} componentId={controllerId} action='controller.wake' />
        {hasJog ? null : <ActionButton control={control} componentId={motion.id} action='motion.home' />}
        <ActionButton
          control={control}
          componentId={motion.id}
          action='motion.move'
          label='Go to work zero'
          parameters={{
            frame: 'work',
            position: Object.fromEntries(axes.filter((axis) => axis.id !== 'z').map((axis) => [axis.id, 0])),
          }}
        />
      </div>
      {hasJog ? <JogPad control={control} motion={motion} axes={axes} /> : null}
      {has(motion.id, 'work-offset.set') && offset !== undefined ? (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs text-muted-foreground'>Zero {offset} here:</span>
          {axes.map((axis) => (
            <ActionButton
              key={axis.id}
              control={control}
              componentId={motion.id}
              action='work-offset.set'
              parameters={{ offset, position: { [axis.id]: 0 } }}
              label={axis.label}
              ariaLabel={`Zero ${axis.label} here`}
            />
          ))}
        </div>
      ) : null}
      <Consequences
        descriptors={[
          declaredAction(entry, controllerId, 'controller.unlock'),
          declaredAction(entry, controllerId, 'controller.wake'),
          declaredAction(entry, motion.id, 'motion.home'),
        ]}
      />
    </>,
  );
}

/**
 * One probe's cycles as its form names them: a button for a single cycle, a choice and a button for several. A form
 * that names no cycles offers none, since the pane cannot know what the probe runs.
 *
 * @param properties - The control and the probe.
 * @returns The control, or nothing.
 */
function ProbeCycle({
  control,
  probe,
}: {
  readonly control: MachineControl;
  readonly probe: MachineComponent;
}): React.JSX.Element | undefined {
  const cycles = formChoices(declaredAction(control.entry, probe.id, 'probe.run'), 'cycle');
  const [cycle, setCycle] = useState(cycles[0]?.value);
  if (cycle === undefined) {
    return undefined;
  }
  const button = (
    <ActionButton control={control} componentId={probe.id} action='probe.run' parameters={{ cycle }} icon={Crosshair} />
  );
  return cycles.length === 1 ? (
    button
  ) : (
    <PrintSetupRow label='Cycle'>
      <ParameterSelect
        label={`${probe.label} cycle`}
        value={cycle}
        groups={[{ options: cycles }]}
        onChange={setCycle}
      />
      {button}
    </PrintSetupRow>
  );
}

/**
 * Tools and probing: probe cycles, a tool change to a chosen tool and measuring the tool.
 *
 * @param properties - The control.
 * @returns The group, or nothing without probes or tools.
 */
function ToolsGroup({ control }: { readonly control: MachineControl }): React.JSX.Element | undefined {
  const { entry } = control;
  const { components } = entry.descriptor.capabilities;
  const probes = components.filter((component) => component.kind === 'probe');
  const tools = components.find(
    (component): component is Extract<MachineComponent, { kind: 'tools' }> => component.kind === 'tools',
  );
  const table = tools === undefined ? undefined : componentValue(entry.snapshot.components, tools.id, 'tools');
  const numbers = table?.table.rows.map((row) => row.number) ?? [];
  const choices =
    numbers.length > 0 ? numbers : Array.from({ length: Math.max(tools?.pockets ?? 0, 1) }, (_, index) => index + 1);
  const [tool, setTool] = useState(() =>
    String(choices.find((number) => number !== table?.current) ?? choices[0] ?? 1),
  );
  const descriptors = [
    ...probes.flatMap((probe) => [
      declaredAction(entry, probe.id, 'probe.run'),
      declaredAction(entry, probe.id, 'tool.measure'),
    ]),
    tools === undefined ? undefined : declaredAction(entry, tools.id, 'tool.change'),
  ].filter((descriptor) => descriptor !== undefined);
  const [first] = descriptors;
  if (first === undefined) {
    return undefined;
  }
  return group(
    'Tools and probing',
    <>
      <Blocked control={control} componentId={first.componentId} action={first.id} />
      <div className='flex flex-wrap gap-2'>
        {probes.map((probe) => (
          <ProbeCycle key={probe.id} control={control} probe={probe} />
        ))}
        {probes.map((probe) => (
          <ActionButton key={`${probe.id}-measure`} control={control} componentId={probe.id} action='tool.measure' />
        ))}
      </div>
      {tools !== undefined && declaredAction(entry, tools.id, 'tool.change') !== undefined ? (
        <PrintSetupRow
          label='Tool'
          description={table?.current === undefined ? undefined : `T${String(table.current)} is in the spindle.`}
        >
          <ParameterSelect
            label='Tool to change to'
            value={tool}
            groups={[
              {
                options: choices.map((number) => ({
                  value: String(number),
                  label: `T${String(number)}`,
                  secondary: table?.table.rows.find((row) => row.number === number)?.description,
                })),
              },
            ]}
            onChange={setTool}
          />
          <ActionButton
            control={control}
            componentId={tools.id}
            action='tool.change'
            parameters={{ tool: Number(tool) }}
            label='Change'
            icon={Wrench}
          />
        </PrintSetupRow>
      ) : null}
      <Consequences descriptors={descriptors} />
    </>,
  );
}

type SpindleComponent = Extract<MachineComponent, { kind: 'spindle' }>;

/** How long a spindle switched on from the pane turns, when its form declares no default. Seconds. */
const preferredSpindleSeconds = 10;
/** The speed a programmed spindle runs at from the pane, when its form declares no default. Revolutions per minute. */
const preferredSpindleSpeed = 10_000;

/**
 * The spindle: on for a bounded time, or off.
 *
 * @param properties - The control and the spindle.
 * @returns The group, or nothing when the machine declares no spindle control.
 */
function SpindleGroup({
  control,
  spindle,
}: {
  readonly control: MachineControl;
  readonly spindle: SpindleComponent;
}): React.JSX.Element | undefined {
  const descriptor = declaredAction(control.entry, spindle.id, 'spindle.set');
  if (descriptor === undefined) {
    return undefined;
  }
  const value = componentValue(control.entry.snapshot.components, spindle.id, 'spindle');
  const check = control.check(spindle.id, 'spindle.set');
  const direction = spindle.directions[0] ?? 'clockwise';
  const spindleSeconds = formNumber(descriptor, 'duration', preferredSpindleSeconds);
  const speed =
    spindle.control === 'programmed' && formParameter(descriptor, 'speed') !== undefined
      ? Math.min(formNumber(descriptor, 'speed', preferredSpindleSpeed), spindle.speed?.max ?? Number.POSITIVE_INFINITY)
      : undefined;
  const description =
    check.status === 'unavailable'
      ? check.message
      : spindle.control === 'switched'
        ? `${descriptor.consequence ?? 'Tau switches it; the speed is set on its own dial.'} It stops by itself after ${String(spindleSeconds)} s.`
        : `Runs at ${speed === undefined ? 'its set speed' : `${speed.toLocaleString()} rpm`} for ${String(spindleSeconds)} s, then stops by itself.`;
  return group(
    spindle.label,
    <PrintSetupRow label={spindle.label} description={description}>
      <QualificationBadge descriptor={descriptor} />
      <ParametersBoolean
        aria-label={spindle.label}
        value={value !== undefined && value.mode !== 'off'}
        disabled={check.status !== 'available' || control.pending !== undefined}
        onChange={(isOn) => {
          void control.apply(
            spindle.id,
            'spindle.set',
            isOn
              ? { mode: direction, ...(speed === undefined ? {} : { speed }), duration: spindleSeconds }
              : { mode: 'off' },
          );
        }}
      />
    </PrintSetupRow>,
  );
}

const fanLevels = [0, 0.25, 0.5, 0.75, 1] as const;
const overrideLevels = [0.5, 0.75, 1, 1.25, 1.5] as const;

/**
 * The choices an `option.set` declares in its form, else a printer's speed profiles.
 *
 * @param entry - The machine.
 * @param descriptor - The action.
 * @returns Value and label pairs.
 */
const optionChoices = (
  entry: MachineDirectoryEntry,
  descriptor: MachineActionDescriptor,
): ReadonlyArray<Readonly<{ value: string; label: string }>> => {
  const declared = formChoices(descriptor, 'option');
  if (declared.length > 0) {
    return declared;
  }
  const kind = entry.descriptor.capabilities.components.find(
    (component) => component.id === descriptor.componentId,
  )?.kind;
  return kind === 'speed-profile'
    ? (fffProcessOf(entry.descriptor.capabilities)?.speedProfiles.map((profile) => ({
        value: profile.id,
        label: `${profile.label} · ${String(profile.percent)} %`,
      })) ?? [])
    : [];
};

/**
 * One switch, level or option row, from the action the machine declares on the component.
 *
 * @param properties - The control and the descriptor.
 * @returns The row.
 */
function AccessoryRow({
  control,
  descriptor,
}: {
  readonly control: MachineControl;
  readonly descriptor: MachineActionDescriptor;
}): React.JSX.Element {
  const { entry } = control;
  const { componentId, id, label } = descriptor;
  /* The level last chosen here, until the machine reports a different one: the machine reports only the speed it
   * runs at, and a program that changes it wins. */
  const [target, setTarget] = useState<Readonly<{ level: number; reported: number | undefined }>>();
  const check = control.check(componentId, id);
  const isDisabled = check.status !== 'available' || control.pending !== undefined;
  const description = check.status === 'unavailable' ? check.message : descriptor.consequence;
  const { components } = entry.snapshot;
  if (id === 'switch.set') {
    return (
      <PrintSetupRow label={label} description={description}>
        <QualificationBadge descriptor={descriptor} />
        <ParametersBoolean
          aria-label={label}
          value={componentValue(components, componentId, 'switch')?.on === true}
          disabled={isDisabled}
          onChange={(on) => {
            void control.apply(componentId, id, { on });
          }}
        />
      </PrintSetupRow>
    );
  }
  if (id === 'level.set') {
    const kind = entry.descriptor.capabilities.components.find((component) => component.id === componentId)?.kind;
    const ratio = componentValue(components, componentId, 'level')?.ratio;
    const levels: readonly number[] = kind === 'override' ? overrideLevels : fanLevels;
    const percent = (level: number): string => `${String(Math.round(level * 100))} %`;
    const chosen =
      target !== undefined && target.reported === ratio
        ? target.level
        : ratio !== undefined && levels.includes(ratio)
          ? ratio
          : undefined;
    return (
      <PrintSetupRow label={label} reading={ratio === undefined ? undefined : percent(ratio)} description={description}>
        <QualificationBadge descriptor={descriptor} />
        <ParameterSelect
          label={label}
          value={chosen === undefined ? '' : String(chosen)}
          placeholder='Set speed'
          isDisabled={isDisabled}
          groups={[{ options: levels.map((level) => ({ value: String(level), label: percent(level) })) }]}
          onChange={(value) => {
            setTarget({ level: Number(value), reported: ratio });
            void control.apply(componentId, id, { ratio: Number(value) });
          }}
        />
      </PrintSetupRow>
    );
  }
  const choices = optionChoices(entry, descriptor);
  return (
    <PrintSetupRow label={label} description={description}>
      <QualificationBadge descriptor={descriptor} />
      <ParameterSelect
        label={label}
        value={componentValue(components, componentId, 'option')?.option ?? ''}
        placeholder='Not reported'
        isDisabled={isDisabled || choices.length === 0}
        groups={[{ options: choices }]}
        onChange={(option) => {
          void control.apply(componentId, id, { option });
        }}
      />
    </PrintSetupRow>
  );
}

const accessoryFamilies: ReadonlySet<string> = new Set(['switch.set', 'level.set', 'option.set']);

/**
 * The Control stage's summary while it is closed: each switch the machine reports.
 *
 * @param entry - The machine as observed.
 * @returns A few words, or nothing.
 * @public
 */
export const controlSummary = (entry: MachineDirectoryEntry): string | undefined =>
  entry.descriptor.capabilities.actions
    .filter((descriptor) => descriptor.id === 'switch.set')
    .flatMap((descriptor) => {
      const value = componentValue(entry.snapshot.components, descriptor.componentId, 'switch');
      return value === undefined ? [] : [`${descriptor.label} ${value.on ? 'on' : 'off'}`];
    })
    .join(' · ') || undefined;

/**
 * Control: the camera, then motion, tools and probing, the spindle, and every switch, level and option the machine
 * declares. A run owns motion, tools and the spindle, so those leave the stage while it lasts.
 *
 * @param properties - The client (for stills) and the control.
 * @returns The stage.
 * @public
 */
export function ControlStage({
  client,
  control,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
}): React.JSX.Element {
  const { entry } = control;
  const { components, actions } = entry.descriptor.capabilities;
  const motion = components.find((component): component is MotionComponent => component.kind === 'motion');
  const spindle = components.find((component): component is SpindleComponent => component.kind === 'spindle');
  const camera = components.find((component) => component.kind === 'camera');
  const accessories = actions.filter((descriptor) => accessoryFamilies.has(descriptor.id));
  const isOwned = isRunOwned(entry);
  return (
    <PrintStage icon={Move} title='Control' summary={controlSummary(entry)} isDefaultOpen={isOwned}>
      {camera === undefined ? null : <CameraView client={client} entry={entry} />}
      {isOwned && motion !== undefined && declaredAction(entry, motion.id, 'motion.jog') !== undefined ? (
        <p className='text-xs text-muted-foreground'>
          Motion, tools and the spindle stay with the job until it ends or is stopped.
        </p>
      ) : null}
      {motion === undefined || isOwned ? null : <MotionGroup control={control} motion={motion} />}
      {isOwned ? null : <ToolsGroup control={control} />}
      {spindle === undefined || isOwned ? null : <SpindleGroup control={control} spindle={spindle} />}
      {accessories.length === 0
        ? null
        : group(
            'Accessories and overrides',
            <div className='-my-1.5 flex min-w-0 flex-col'>
              {accessories.map((descriptor) => (
                <AccessoryRow
                  key={`${descriptor.componentId}:${descriptor.id}`}
                  control={control}
                  descriptor={descriptor}
                />
              ))}
            </div>,
          )}
    </PrintStage>
  );
}

const resultWords: Readonly<Record<'good' | 'uncertain' | 'failed', string>> = {
  good: 'Good fit',
  uncertain: 'Uncertain',
  failed: 'Failed',
};

/**
 * A measured value as the person reads it: a pressure advance as "K 0.020", anything else as text.
 *
 * @param value - The result's value.
 * @returns The words.
 */
const describeResult = (value: unknown): string =>
  typeof value === 'number'
    ? `K ${value.toFixed(3)}`
    : isRecord(value) && typeof value['pressureAdvance'] === 'number'
      ? `K ${value['pressureAdvance'].toFixed(3)}`
      : JSON.stringify(value);

/**
 * Whether an activity still belongs in front of the person.
 *
 * @param activity - Any activity.
 * @returns True while it runs, needs the person, or has results or a failure to read.
 */
const isShownActivity = (activity: MachineActivity): boolean =>
  activity.state !== 'succeeded' || (activity.results?.length ?? 0) > 0;

/**
 * Keep a measured calibration result: a name and Save, or Discard.
 *
 * @param properties - The control, the activity and the dismissal.
 * @returns The form.
 */
function CalibrationResults({
  control,
  activity,
  onDiscard,
}: {
  readonly control: MachineControl;
  readonly activity: MachineActivity;
  readonly onDiscard: () => void;
}): React.JSX.Element {
  const results = activity.results ?? [];
  const usable = results.filter((result) => result.confidence !== 'failed');
  const [resultId, setResultId] = useState(usable[0]?.id ?? '');
  const [name, setName] = useState(`${activity.label} (measured)`.slice(0, 40));
  return (
    <div role='group' aria-label='Calibration result' className='flex min-w-0 flex-col gap-2 text-xs'>
      <dl className='flex flex-col gap-1'>
        {results.map((result) => (
          <PrintRow
            key={result.id}
            label={result.label}
            badge={
              <Badge
                variant={result.confidence === 'good' ? 'secondary' : 'outline'}
                className={result.confidence === 'good' ? undefined : 'border-transparent bg-feature/10 text-feature'}
              >
                {resultWords[result.confidence]}
              </Badge>
            }
          >
            {describeResult(result.value)}
          </PrintRow>
        ))}
      </dl>
      {usable.length === 0 ? null : (
        <div className='-my-1.5 flex min-w-0 flex-col'>
          {usable.length > 1 ? (
            <PrintSetupRow label='Keep'>
              <ParameterSelect
                label='Result to keep'
                value={resultId}
                groups={[{ options: usable.map((result) => ({ value: result.id, label: result.label })) }]}
                onChange={setResultId}
              />
            </PrintSetupRow>
          ) : null}
          <PrintSetupRow label='Name'>
            <Input
              aria-label='Profile name'
              className='h-6 text-xs'
              maxLength={40}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </PrintSetupRow>
        </div>
      )}
      <div className='flex flex-wrap gap-2'>
        <ActionButton
          control={control}
          componentId={activity.componentId}
          action='material.calibration.save'
          parameters={{ source: 'measured', activityId: activity.activityId, resultId, name: name.trim() }}
          label='Save as a profile'
          variant='default'
          onDone={(isAccepted) => {
            if (isAccepted) {
              onDiscard();
            }
          }}
        />
        <Button type='button' size='sm' variant='outline' onClick={onDiscard}>
          Discard
        </Button>
      </div>
      <p className='text-muted-foreground'>Nothing changes on the machine until you save a result.</p>
    </div>
  );
}

/**
 * The component that answers a prompt: the activity's own, else any component declaring `interaction.respond`.
 *
 * @param entry - The machine.
 * @param activity - The activity asking.
 * @returns The component id, or nothing when the machine takes answers only at its screen.
 */
const respondingComponent = (entry: MachineDirectoryEntry, activity: MachineActivity): string | undefined =>
  declaredAction(entry, activity.componentId, 'interaction.respond') === undefined
    ? entry.descriptor.capabilities.actions.find((descriptor) => descriptor.id === 'interaction.respond')?.componentId
    : activity.componentId;

/**
 * One activity at the machine: its steps, the instruction or the question that needs the person, its cancel, and
 * what a measuring activity found.
 *
 * @param properties - The control, the activity and its dismissal.
 * @returns The card.
 */
function ActivityCard({
  control,
  activity,
  onDiscard,
}: {
  readonly control: MachineControl;
  readonly activity: MachineActivity;
  readonly onDiscard: () => void;
}): React.JSX.Element {
  const { entry } = control;
  const cardRef = useRef<HTMLElement>(null);
  const { awaiting, results } = activity;
  const prompt = awaiting?.kind === 'confirmation' ? awaiting : undefined;
  const respondOn = respondingComponent(entry, activity);
  const [answered, setAnswered] = useState<string>();
  const moment = `${activity.activityId}:${prompt?.promptId ?? awaiting?.kind ?? ''}`;
  /* Each new question comes into view wherever the person scrolled; a moment awaiting nothing ends in ':'. */
  useEffect(() => {
    if (!moment.endsWith(':')) {
      cardRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [moment]);
  const isWaiting = awaiting !== undefined;
  const isFinished = activity.state === 'succeeded' || activity.state === 'failed';
  return (
    <section
      ref={cardRef}
      aria-label={activity.label}
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-card p-3'
    >
      <p role='status' className='flex min-w-0 items-center gap-2 text-sm'>
        {isWaiting ? (
          <Hand aria-hidden className='size-4 shrink-0 text-information' />
        ) : activity.state === 'failed' ? (
          <CircleAlert aria-hidden className='size-4 shrink-0 text-feature' />
        ) : isFinished ? (
          <Check aria-hidden className='size-4 shrink-0 text-success' />
        ) : (
          <LoaderCircle aria-hidden className='size-4 shrink-0 animate-spin motion-reduce:animate-none' />
        )}
        <span className='min-w-0 truncate'>{activity.label}</span>
        <span className='sr-only'>{isWaiting ? ` ${entry.name} waits for you: ${awaiting.label}` : ''}</span>
      </p>
      {activity.steps.length === 0 ? null : <PrintSteps steps={activity.steps} layout='list' />}
      {activity.message === undefined ? null : <p className='text-xs text-muted-foreground'>{activity.message}</p>}
      {awaiting?.kind === 'instruction' ? <p className='text-xs'>{awaiting.label}</p> : null}
      {prompt === undefined ? null : (
        <div role='group' aria-label={prompt.label} className='flex min-w-0 flex-col gap-2 text-xs'>
          {activity.steps.some((step) => step.state === 'active' && step.label === prompt.label) ? null : (
            <p>{prompt.label}</p>
          )}
          {respondOn === undefined ? (
            <p className='text-muted-foreground'>Answer on the machine&apos;s screen.</p>
          ) : answered === prompt.promptId ? (
            <p role='status' className='flex items-center gap-2 text-muted-foreground'>
              <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
              Waiting for {entry.name} to continue…
            </p>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {prompt.answers.map((answer) => (
                <ActionButton
                  key={answer.id}
                  control={control}
                  componentId={respondOn}
                  action='interaction.respond'
                  parameters={{ activityId: activity.activityId, promptId: prompt.promptId, answer: answer.id }}
                  label={answer.label}
                  variant={answer.role === 'confirm' ? 'default' : 'outline'}
                  onDone={(isAccepted) => {
                    if (isAccepted) {
                      setAnswered(prompt.promptId);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {results === undefined || results.length === 0 ? null : (
        <CalibrationResults control={control} activity={activity} onDiscard={onDiscard} />
      )}
      {activity.cancel === undefined || isFinished ? null : (
        <div>
          <ActionButton
            control={control}
            componentId={activity.cancel.componentId}
            action={activity.cancel.action}
            label='Cancel'
            variant='ghost'
          />
        </div>
      )}
    </section>
  );
}

/**
 * Everything in progress at the machine that is not the run itself, outside the stages: a question is never folded
 * away.
 *
 * @param properties - The control.
 * @returns The cards, or nothing.
 * @public
 */
export function Activities({ control }: { readonly control: MachineControl }): React.JSX.Element | undefined {
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());
  const shown = control.entry.snapshot.activities.filter(
    (activity) => isShownActivity(activity) && !discarded.has(activity.activityId),
  );
  if (shown.length === 0) {
    return undefined;
  }
  return (
    <>
      {shown.map((activity) => (
        <ActivityCard
          key={activity.activityId}
          control={control}
          activity={activity}
          onDiscard={() => {
            setDiscarded((current) => new Set(current).add(activity.activityId));
          }}
        />
      ))}
    </>
  );
}

const rebind = 'bind the machine again in Settings under Machines';

/**
 * What a person reads when a still capture fails, by the fixed code it rejects with: the camera
 * leg (`@taucad/host`), its pinned connection and saved credentials, and the host's own checks.
 */
const stillFailures: ReadonlyMap<string, string> = new Map([
  [
    'MACHINE_STILL_FFMPEG_MISSING',
    'Tau could not find ffmpeg, which capturing a still needs; install it (with Homebrew on macOS: brew install ffmpeg; on Windows: winget install ffmpeg), then capture again.',
  ],
  [
    'MACHINE_STILL_FFMPEG_FAILED',
    'Tau could not start ffmpeg; reinstall it (with Homebrew on macOS: brew reinstall ffmpeg), then capture again.',
  ],
  ['MACHINE_STILL_AUTH_REJECTED', `The camera refused the machine's saved credentials; ${rebind}.`],
  ['MACHINE_SECRET_UNKNOWN', `Tau no longer has this machine's credentials; ${rebind}.`],
  [
    'MACHINE_TLS_PIN_MISMATCH',
    `The camera presented a different certificate from the one saved when the machine was bound, so Tau did not connect; if the machine was reset or replaced, ${rebind}.`,
  ],
  [
    'MACHINE_CONNECT_FAILED',
    'Tau could not connect to the camera; check that the machine is on and on this network, then capture again.',
  ],
  [
    'MACHINE_CONNECT_TIMEOUT',
    'The camera did not answer in time; check that the machine is on and on this network, then capture again.',
  ],
  [
    'MACHINE_STILL_TIMEOUT',
    'The camera sent no picture in time; check that the machine is on and connected, then capture again.',
  ],
  [
    'MACHINE_STILL_STREAM_FAILED',
    "The camera's video stream broke off before a picture arrived; capture again in a moment.",
  ],
  [
    'MACHINE_STILL_CAPTURE_FAILED',
    "The camera's stream ended without a picture, which can happen while the camera wakes up; capture again in a moment.",
  ],
  ['MACHINE_STILL_TOO_LARGE', 'The camera sent a picture larger than Tau accepts, so it was discarded; capture again.'],
  ['MACHINE_STILL_INVALID', 'The camera sent a picture Tau could not accept; capture again.'],
  [
    'MACHINE_STILL_PROXY_FAILED',
    'Tau could not open its local connection to the camera on this computer; capture again, and restart Tau if it keeps failing.',
  ],
  [
    'MACHINE_STILL_REQUEST_INVALID',
    'Tau built an invalid request for this camera, so nothing was sent; report this as a bug.',
  ],
  ['MACHINE_STILL_UNAVAILABLE', 'Tau is not connected to this machine right now; capture again once it reconnects.'],
  ['MACHINE_STILL_RATE_LIMITED', 'Stills are limited to one every 5 seconds; wait a moment, then capture again.'],
]);

const unknownStillFailure = 'The camera could not capture a still; capture again in a moment.';

/**
 * A failed still capture in the person's words. The machine channel carries the code as the
 * message and a desktop shell may wrap it in its own words, so the code is looked for anywhere in
 * the message, after the error's own `code`. A failure that names no known code keeps a generic
 * sentence plus the code, or the message when it names none.
 *
 * @param error - What `captureStill` rejected with.
 * @returns One sentence saying what happened and what to do.
 * @public
 */
export const describeStillFailure = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const codes = [
    ...[failureCodeOf(error)].filter((code) => code !== undefined),
    ...(message.match(/\b[A-Z][\dA-Z]*(?:_[\dA-Z]+)+\b/gu) ?? []),
  ];
  const sentence = codes.map((code) => stillFailures.get(code)).find((candidate) => candidate !== undefined);
  if (sentence !== undefined) {
    return sentence;
  }
  const detail = codes[0] ?? message.trim();
  return detail === '' ? unknownStillFailure : `${unknownStillFailure} (${detail})`;
};

/**
 * The camera, first in the Control center: the latest still at full width, or an empty frame that
 * captures one. A still expires when the host says so.
 *
 * @param properties - The client and the machine.
 * @returns The camera frame.
 */
function CameraView({
  client,
  entry,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
}): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [still, setStill] = useState<Readonly<{ url: string; capturedAt: string; expiresAt: string }>>();
  const captureAbort = useRef<AbortController | undefined>(undefined);
  const now = useNow();

  useEffect(
    () => () => {
      captureAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!still) {
      return;
    }
    const remaining = Date.parse(still.expiresAt) - Date.now();
    const stillExpiry = globalThis.setTimeout(
      () => {
        setStill((current) => (current?.url === still.url ? undefined : current));
      },
      Math.max(0, remaining),
    );
    return () => {
      globalThis.clearTimeout(stillExpiry);
      URL.revokeObjectURL(still.url);
    };
  }, [still]);

  const capture = async (): Promise<void> => {
    const abort = new AbortController();
    captureAbort.current = abort;
    setIsBusy(true);
    setError(undefined);
    try {
      const result = await client.captureStill({ machineId: entry.machineId, signal: abort.signal });
      abort.signal.throwIfAborted();
      setStill({
        url: URL.createObjectURL(new Blob([result.bytes], { type: result.mediaType })),
        capturedAt: result.capturedAt,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        setError(describeStillFailure(error));
      }
    } finally {
      if (captureAbort.current === abort) {
        captureAbort.current = undefined;
        setIsBusy(false);
      }
    }
  };
  const busyGlyph = <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />;

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <figure
        aria-label='Camera'
        className='flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-muted/30'
      >
        {still ? (
          <img src={still.url} alt={`Latest still from ${entry.name}`} className='aspect-video w-full object-contain' />
        ) : (
          <div className='flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground'>
            <Camera aria-hidden className='size-5' />
            <Button type='button' size='xs' variant='outline' disabled={isBusy} onClick={capture}>
              {isBusy ? busyGlyph : null}
              Capture still
            </Button>
          </div>
        )}
        {still ? (
          <figcaption className='flex min-h-8 min-w-0 items-center gap-2 border-t border-border/70 pr-1 pl-2 text-xs text-muted-foreground'>
            <span className='min-w-0 flex-1 truncate'>
              Captured <time dateTime={still.capturedAt}>{formatAge(still.capturedAt, now)}</time>
            </span>
            <Button type='button' size='xs' variant='ghost' disabled={isBusy} onClick={capture}>
              {isBusy ? busyGlyph : <RefreshCw aria-hidden />}
              Capture again
            </Button>
          </figcaption>
        ) : null}
      </figure>
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
    </div>
  );
}
