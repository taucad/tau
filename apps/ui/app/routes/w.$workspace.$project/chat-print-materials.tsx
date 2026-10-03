import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import type { MachineDirectoryEntry, MachineManifest } from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import {
  actionAvailability,
  describeWaits,
  useMachineAction,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import type { ActionAvailability, ApplyMachineAction } from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PrintNotice, PrintRow, StaleBadge, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatQuantity, materialSlotLabel, readableStage } from '#routes/w.$workspace.$project/chat-print-summary.js';

type Material = MachineDirectoryEntry['snapshot']['setup']['materials'][number];

/** The slot a material system reports while nothing is in the toolhead (Bambu's 255). */
const noSlot = 255;

/** How long an accepted change waits for the printer to report it before the pane offers it again. */
const reportWithin = 15_000;

/** A filament change the printer is in the middle of. @public */
export type MaterialChange = Readonly<{ kind: 'load' | 'unload'; slot: number; step?: string }>;

/**
 * The filament change in progress: the printer reports a target slot other than the one in the toolhead.
 *
 * ponytail: derived from `targetSlot` and the run's stage phrase until the machine-actions guide's
 * `materialSystem.change` observation lands; then read that instead.
 *
 * @param entry - The machine as observed.
 * @returns The change, or nothing.
 * @public
 */
export const materialChange = (entry: MachineDirectoryEntry): MaterialChange | undefined => {
  const { materialSystem, run } = entry.snapshot;
  const target = materialSystem?.targetSlot;
  if (target === undefined || target === materialSystem?.currentSlot) {
    return undefined;
  }
  const step = readableStage(run?.stage);
  const facts = step === undefined ? {} : { step };
  return target === noSlot
    ? { kind: 'unload', slot: materialSystem?.currentSlot ?? noSlot, ...facts }
    : { kind: 'load', slot: target, ...facts };
};

const materialName = (material: Material): string =>
  material.state === 'loaded' ? (material.materialId ?? 'Loaded') : material.state === 'empty' ? 'Empty' : 'Unknown';

/**
 * The slot in the toolhead, as a closed Monitor's summary says it: "A1 PETG".
 *
 * @param entry - The machine as observed.
 * @param manifest - Its manifest, for slot names.
 * @returns The phrase, or nothing while no slot is in use.
 * @public
 */
export const materialInUse = (
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
): string | undefined => {
  const current = entry.snapshot.materialSystem?.currentSlot;
  const material = entry.snapshot.setup.materials.find((candidate) => candidate.slot === current);
  return material === undefined ? undefined : `${materialSlotLabel(material.slot, manifest)} ${materialName(material)}`;
};

function Remaining({ percent }: { readonly percent: number | undefined }): React.JSX.Element | undefined {
  if (percent === undefined) {
    return undefined;
  }
  return (
    <span className='flex shrink-0 items-center gap-1.5 text-muted-foreground tabular-nums'>
      <span aria-hidden className='h-1 w-6 overflow-hidden rounded-full bg-muted'>
        <span className='block h-full rounded-full bg-muted-foreground/70' style={{ width: `${String(percent)}%` }} />
      </span>
      {percent} %
    </span>
  );
}

function SlotSwatch({
  material,
  size = 'sm',
}: {
  readonly material: Material;
  readonly size?: 'sm' | 'lg';
}): React.JSX.Element {
  return material.color === undefined ? (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-full border border-dashed border-muted-foreground/60',
        size === 'sm' ? 'size-4' : 'size-8',
      )}
    />
  ) : (
    <span className={cn('flex shrink-0', size === 'lg' && '[&>[data-slot=material-swatch]]:size-8')}>
      <MaterialSwatch materials={[{ color: material.color, roughness: 0.35, metalness: 0 }]} />
    </span>
  );
}

/** What one slot offers now: its names, the verb, the question it asks and why it waits. */
type SlotPlan = Readonly<{
  label: string;
  name: string;
  isExternal: boolean;
  isCurrent: boolean;
  verb: 'load' | 'unload';
  buttonLabel: string;
  confirmLabel: string;
  question: string;
  /** Why the action waits; nothing when it can be taken. */
  wait: string | undefined;
}>;

/**
 * The plan for one slot from the observation: load what is not in the toolhead, unload what is.
 *
 * @param input - The machine, its manifest, the slot and the declared action's availability.
 * @returns The plan.
 */
const slotPlan = ({
  entry,
  manifest,
  material,
  availability,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly availability: ActionAvailability | undefined;
}): SlotPlan => {
  const label = materialSlotLabel(material.slot, manifest);
  const name = materialName(material);
  const isExternal = material.slot === manifest?.materialSystem.externalSpoolSlot;
  const currentSlot = entry.snapshot.materialSystem?.currentSlot;
  const isCurrent = currentSlot === material.slot;
  const current = entry.snapshot.setup.materials.find((candidate) => candidate.slot === currentSlot);
  const goesBack = current === undefined ? '' : ` and ${materialSlotLabel(current.slot, manifest)} goes back first`;
  const change = materialChange(entry);
  const emptyWait = isExternal
    ? 'Hang a spool on the external holder and set its material on the printer.'
    : `Put a spool in ${label}; the AMS reads a Bambu spool's tag.`;
  const busyWait =
    entry.snapshot.activeRunId === undefined
      ? change === undefined || change.slot === material.slot
        ? describeWaits([availability])[0]
        : 'Wait for the filament change to finish.'
      : 'Filament changes wait until the run ends.';
  if (isCurrent) {
    return {
      label,
      name,
      isExternal,
      isCurrent,
      verb: 'unload',
      buttonLabel: 'Unload',
      confirmLabel: `Unload ${label}`,
      question: `Unload ${label} (${name})? The nozzle heats so the filament can retract${isExternal ? '; pull it out of the toolhead once it stops.' : ` into ${label}.`}`,
      wait: busyWait,
    };
  }
  return {
    label,
    name,
    isExternal,
    isCurrent,
    verb: 'load',
    buttonLabel: isExternal ? 'Feed into toolhead' : 'Load into toolhead',
    confirmLabel: `${isExternal ? 'Feed' : 'Load'} ${label}`,
    question: isExternal
      ? `Feed the external ${name}? The nozzle heats for ${name}${goesBack}; then push the filament into the toolhead when asked.`
      : `Load ${label} (${name}) into the toolhead? The nozzle heats for ${name}${goesBack}.`,
    wait: material.state === 'loaded' ? busyWait : emptyWait,
  };
};

/**
 * What the slot holds and where: the swatch, the material, the place, then its remaining, colour,
 * profile and the AMS unit's humidity and temperature.
 *
 * @param properties - The machine, its manifest, the slot and its plan.
 * @returns The facts.
 */
function SlotFacts({
  entry,
  manifest,
  material,
  plan,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly plan: SlotPlan;
}): React.JSX.Element {
  const slotsPerUnit = manifest?.materialSystem.slotsPerUnit ?? 0;
  const unit =
    plan.isExternal || slotsPerUnit <= 0
      ? undefined
      : entry.snapshot.materialSystem?.units.find(
          (candidate) => candidate.unit === Math.floor(material.slot / slotsPerUnit),
        );
  const unitLine = [
    unit?.humidityIndex === undefined ? undefined : `humidity ${String(unit.humidityIndex)}`,
    unit?.temperature === undefined ? undefined : formatQuantity(unit.temperature),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  return (
    <>
      <div className='flex min-w-0 items-center gap-2.5'>
        <SlotSwatch material={material} size='lg' />
        <div className='flex min-w-0 flex-1 flex-col'>
          <p className='truncate text-sm font-medium'>
            <span className='font-mono'>{plan.label}</span> · {plan.name}
          </p>
          <p className='truncate text-xs text-muted-foreground'>
            {plan.isCurrent ? 'In the toolhead' : plan.isExternal ? 'On the external holder' : 'In the AMS'}
          </p>
        </div>
      </div>
      <dl className='flex flex-col gap-0.5'>
        {material.remainingPercent === undefined ? null : (
          <PrintRow label='Remaining'>{material.remainingPercent} %</PrintRow>
        )}
        {material.color === undefined ? null : <PrintRow label='Colour'>{material.color.slice(0, 7)}</PrintRow>}
        {material.profileId === undefined ? null : <PrintRow label='Profile'>{material.profileId}</PrintRow>}
        {unit === undefined ? null : <PrintRow label='AMS'>{unitLine || 'Not reported'}</PrintRow>}
      </dl>
    </>
  );
}

/**
 * The one question a slot action asks before the nozzle heats.
 *
 * @param properties - The slot's plan, whether the action is in flight, and the two answers.
 * @returns The confirmation.
 */
function SlotConfirmation({
  plan,
  isBusy,
  onConfirm,
  onKeep,
}: {
  readonly plan: SlotPlan;
  readonly isBusy: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}): React.JSX.Element {
  return (
    <div
      role='alertdialog'
      aria-label={`Confirm ${plan.buttonLabel.toLowerCase()}`}
      className='rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'
    >
      <p>{plan.question}</p>
      <div className='mt-2 flex flex-wrap gap-2'>
        <Button type='button' size='sm' autoFocus disabled={isBusy} onClick={onConfirm}>
          {isBusy ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
          {plan.confirmLabel}
        </Button>
        <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={onKeep}>
          Keep as is
        </Button>
      </div>
    </div>
  );
}

/**
 * The slot's action and its moments: offered, confirming, sent, and in progress as the printer reports it.
 *
 * @param properties - The machine, its manifest, the slot, its plan and the action seam.
 * @returns The actions.
 */
function SlotActions({
  entry,
  manifest,
  material,
  plan,
  availability,
  apply,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly plan: SlotPlan;
  readonly availability: ActionAvailability | undefined;
  readonly apply: ApplyMachineAction | undefined;
}): React.JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);
  /* An accepted change until the printer reports it: the slot it left, and when. */
  const [sent, setSent] = useState<Readonly<{ currentSlot: number | undefined; at: number }>>();
  const waitId = useId();
  const now = useNow();
  const action = useMachineAction(entry, apply);
  const currentSlot = entry.snapshot.materialSystem?.currentSlot;
  const change = materialChange(entry);
  const isAwaiting =
    sent !== undefined && change === undefined && sent.currentSlot === currentSlot && now - sent.at < reportWithin;
  const continuing = actionAvailability({ entry, manifest, action: 'material.continue', apply });
  const confirm = async (): Promise<void> => {
    const sending = { currentSlot, at: Date.now() };
    // Unload names the slot it shows, so the host can hold it to the printer's report (machine-actions guide).
    const isAccepted = await action.run(`material.${plan.verb}`, { slot: material.slot });
    setIsConfirming(false);
    setSent(isAccepted ? sending : undefined);
  };
  const error = action.error ? <PrintNotice tone='destructive'>{action.error}</PrintNotice> : null;

  if (change?.slot === material.slot) {
    return (
      <>
        <MaterialChangeProgress
          change={change}
          plan={plan}
          isContinueAvailable={continuing?.isAvailable === true}
          isBusy={action.pending !== undefined}
          onContinue={(answer) => {
            void action.run('material.continue', { answer });
          }}
        />
        {error}
      </>
    );
  }
  if (isAwaiting) {
    return (
      <p role='status' className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
        <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
        Sent; waiting for {entry.name} to start
      </p>
    );
  }
  if (isConfirming) {
    return (
      <SlotConfirmation
        plan={plan}
        isBusy={action.pending !== undefined}
        onConfirm={() => {
          void confirm();
        }}
        onKeep={() => {
          setIsConfirming(false);
        }}
      />
    );
  }
  const canAct = plan.wait === undefined && availability?.isAvailable === true && change === undefined;
  return (
    <>
      {material.state === 'loaded' && availability !== undefined ? (
        <Button
          type='button'
          size='sm'
          variant={plan.isCurrent ? 'outline' : 'default'}
          className='self-start'
          disabled={!canAct}
          aria-describedby={plan.wait === undefined ? undefined : waitId}
          onClick={() => {
            setIsConfirming(true);
          }}
        >
          {plan.isCurrent ? <ArrowUpFromLine aria-hidden /> : <ArrowDownToLine aria-hidden />}
          {plan.buttonLabel}
        </Button>
      ) : null}
      {plan.wait === undefined ? null : (
        <p id={waitId} className='text-xs text-muted-foreground'>
          {plan.wait}
        </p>
      )}
      {error}
    </>
  );
}

/**
 * One slot opened from the list: what is in it, where it is, and what can be done with it. Loading and
 * unloading ask once, then follow the printer's report; the external spool asks the person to feed it.
 *
 * @param properties - The machine, its manifest, the slot, the action seam and the way back.
 * @returns The slot's detail.
 */
function SlotDetail({
  entry,
  manifest,
  material,
  apply,
  onBack,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly apply: ApplyMachineAction | undefined;
  readonly onBack: () => void;
}): React.JSX.Element {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const isCurrent = entry.snapshot.materialSystem?.currentSlot === material.slot;
  const availability = actionAvailability({
    entry,
    manifest,
    action: isCurrent ? 'material.unload' : 'material.load',
    apply,
  });
  const plan = slotPlan({ entry, manifest, material, availability });
  return (
    <div
      role='group'
      aria-label={`Slot ${plan.label}`}
      className='flex min-w-0 flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2'
    >
      <button
        ref={backRef}
        type='button'
        className='-mx-1 flex min-h-7 w-fit cursor-action items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:focus-outline motion-reduce:transition-none'
        onClick={onBack}
      >
        <ChevronLeft aria-hidden className='size-3.5' />
        All slots
      </button>
      <SlotFacts entry={entry} manifest={manifest} material={material} plan={plan} />
      <SlotActions
        entry={entry}
        manifest={manifest}
        material={material}
        plan={plan}
        availability={availability}
        apply={apply}
      />
    </div>
  );
}

/**
 * A load or unload in progress, by what the printer reports. Feeding the external spool needs the
 * person: they push the filament in and say whether it came out of the nozzle.
 *
 * @param properties - The change, the slot's plan and the continue step.
 * @returns The progress.
 */
function MaterialChangeProgress({
  change,
  plan: { label, name, isExternal },
  isContinueAvailable,
  isBusy,
  onContinue,
}: {
  readonly change: MaterialChange;
  readonly plan: SlotPlan;
  readonly isContinueAvailable: boolean;
  readonly isBusy: boolean;
  /** What the person saw: the filament came out of the nozzle, or feed it again. */
  readonly onContinue: (answer: 'extruded' | 'retry') => void;
}): React.JSX.Element {
  const status = (
    <p role='status' className='flex min-w-0 items-center gap-2 text-xs'>
      <LoaderCircle
        aria-hidden
        className='size-3.5 shrink-0 animate-spin text-information motion-reduce:animate-none'
      />
      <span className='min-w-0'>
        {change.kind === 'load' ? `Loading ${label}` : `Unloading ${label}`}
        {change.step === undefined ? '…' : ` · ${change.step}`}
      </span>
    </p>
  );
  if (change.kind !== 'load' || !isExternal) {
    return status;
  }
  return (
    <div className='flex min-w-0 flex-col gap-2'>
      {status}
      <div role='group' aria-label='Feed the external spool' className='rounded-lg border border-border/70 p-2 text-xs'>
        <p>
          Once the nozzle is hot, push the {name} into the toolhead until the extruder grips it.{' '}
          {isContinueAvailable
            ? 'Choose Done when filament comes out of the nozzle, or Retry to extrude again.'
            : "Then confirm on the printer's screen."}
        </p>
        {isContinueAvailable ? (
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              disabled={isBusy}
              onClick={() => {
                onContinue('extruded');
              }}
            >
              Done
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={isBusy}
              onClick={() => {
                onContinue('retry');
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The material slots, one per row, each opening its own detail in place: the list slides away and the
 * slot slides in, and All slots brings the list back with focus on the row it left.
 *
 * @param properties - The machine, its manifest, the action seam and whether the observation is stale.
 * @returns The slots.
 * @public
 */
export function MaterialSlots({
  entry,
  manifest,
  apply,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly apply: ApplyMachineAction | undefined;
  readonly isStale: boolean;
}): React.JSX.Element {
  const [opened, setOpened] = useState<number>();
  /* A new object per return, so returning to the same row twice still moves focus. */
  const [returnedFrom, setReturnedFrom] = useState<Readonly<{ slot: number }>>();
  const rows = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    if (returnedFrom !== undefined) {
      rows.current.get(returnedFrom.slot)?.focus();
    }
  }, [returnedFrom]);
  const { materials } = entry.snapshot.setup;
  const { materialSystem } = entry.snapshot;
  const change = materialChange(entry);
  const material = materials.find((candidate) => candidate.slot === opened);

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>Material</h4>
        {isStale ? <StaleBadge /> : null}
      </div>
      {material ? (
        <SlotDetail
          key={material.slot}
          entry={entry}
          manifest={manifest}
          material={material}
          apply={apply}
          onBack={() => {
            setReturnedFrom({ slot: material.slot });
            setOpened(undefined);
          }}
        />
      ) : materials.length === 0 ? (
        <p className='text-xs text-muted-foreground'>No material slots observed.</p>
      ) : (
        <ul
          aria-label='Material slots'
          className={cn(
            'flex min-w-0 flex-col',
            returnedFrom !== undefined &&
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2',
          )}
        >
          {materials.map((slot) => {
            const label = materialSlotLabel(slot.slot, manifest);
            const isCurrent = materialSystem?.currentSlot === slot.slot;
            const isChanging = change?.slot === slot.slot;
            return (
              <li key={slot.slot}>
                <button
                  ref={(element) => {
                    if (element) {
                      rows.current.set(slot.slot, element);
                    } else {
                      rows.current.delete(slot.slot);
                    }
                  }}
                  type='button'
                  className='-mx-1 flex min-h-8 w-[calc(100%+0.5rem)] min-w-0 cursor-action items-center gap-2 rounded-md px-1 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:focus-outline motion-reduce:transition-none'
                  onClick={() => {
                    setOpened(slot.slot);
                  }}
                >
                  <span className='w-7 shrink-0 font-mono text-muted-foreground'>{label}</span>
                  <SlotSwatch material={slot} />
                  <span className={cn('min-w-0 flex-1 truncate', slot.state !== 'loaded' && 'text-muted-foreground')}>
                    {materialName(slot)}
                  </span>
                  {isChanging ? (
                    <LoaderCircle
                      aria-label={change.kind === 'unload' ? 'Unloading' : 'Loading'}
                      className='size-3.5 shrink-0 animate-spin text-information motion-reduce:animate-none'
                    />
                  ) : isCurrent ? (
                    <Badge variant='outline' className='shrink-0'>
                      In use
                    </Badge>
                  ) : null}
                  <Remaining percent={slot.remainingPercent} />
                  <ChevronRight aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
