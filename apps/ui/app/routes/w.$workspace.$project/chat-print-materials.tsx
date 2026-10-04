import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, LoaderCircle, Palette } from 'lucide-react';
import { z } from 'zod';
import type { MachineDirectoryEntry, MachineManifest } from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { StringColorPicker } from '#components/ui/string-color-picker.js';
import {
  actionAvailability,
  describeWaits,
  useMachineAction,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import type { ActionAvailability, ApplyMachineAction } from '#routes/w.$workspace.$project/chat-print-controls.js';
import {
  PrintNotice,
  PrintRow,
  PrintSteps,
  StaleBadge,
  useNow,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import type { PrintStep } from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatQuantity, materialSlotLabel, readableStage } from '#routes/w.$workspace.$project/chat-print-summary.js';

type Material = MachineDirectoryEntry['snapshot']['setup']['materials'][number];

/** The slot a material system reports while nothing is in the toolhead (Bambu's 255). */
const noSlot = 255;

/** How long an accepted action waits for the printer to report it before the pane says it has not. */
const reportWithin = 15_000;

// ---------------------------------------------------------------------------
// ponytail: snapshot fields the machine-actions guide proposes (its revision 2 settles their names), read only when an
// observation carries them, as the polish canvas's simulated printer does. The runtime's strict snapshot carries none
// yet, so the product derives what it can from `targetSlot` and the run's stage. Replace with the runtime's types once
// they land.

/** The proposed `materialSystem.change`: the printer's own steps for one change, and the prompt it waits on. */
const observedChangeSchema = z.object({
  changeId: z.string(),
  kind: z.enum(['load', 'unload']),
  slot: z.number().int(),
  steps: z.array(z.object({ id: z.string(), label: z.string(), actor: z.enum(['machine', 'person']) })).min(1),
  step: z.string(),
  /** An answer names the prompt, so a late answer never answers a later one. */
  awaiting: z.object({ kind: z.enum(['feed', 'confirmation']), promptId: z.string() }).optional(),
});

/** The proposed slot facts: how its material was identified and the nozzle range it prints at. */
const observedSlotSchema = z.object({
  identifiedBy: z.enum(['tag', 'person']).optional(),
  nozzleTemperature: z.object({ min: z.number(), max: z.number() }).optional(),
});

/** The presets `material.set` declares in its parameters: `profile.oneOf` of `{ const, title }`. */
const materialPresetsSchema = z.object({
  properties: z.object({
    profile: z.object({ oneOf: z.array(z.object({ const: z.string(), title: z.string() })).min(1) }),
  }),
});

const observedChange = (entry: MachineDirectoryEntry): z.infer<typeof observedChangeSchema> | undefined => {
  const system = entry.snapshot.materialSystem;
  return system !== undefined && 'change' in system ? observedChangeSchema.safeParse(system.change).data : undefined;
};

const observedSlot = (material: Material): z.infer<typeof observedSlotSchema> =>
  observedSlotSchema.safeParse(material).data ?? {};

/** A preset a person can set a slot to: the vendor's profile id and its name. */
type MaterialPreset = Readonly<{ const: string; title: string }>;

const materialPresets = (manifest: MachineManifest | undefined): readonly MaterialPreset[] =>
  materialPresetsSchema.safeParse(manifest?.actions.find((action) => action.id === 'material.set')?.parameters).data
    ?.properties.profile.oneOf ?? [];

// ---------------------------------------------------------------------------

/** A filament change the printer is in the middle of. @public */
export type MaterialChange = Readonly<{
  kind: 'load' | 'unload';
  slot: number;
  /** What the printer reports doing now, in its words. */
  step?: string;
  /** The change as the printer reports it, when it does: its steps and the prompt it waits on. */
  reported?: Readonly<{
    steps: readonly PrintStep[];
    awaiting?: Readonly<{ kind: 'feed' | 'confirmation'; promptId: string }>;
  }>;
}>;

/**
 * The filament change in progress. A printer that reports the change names its steps; otherwise it shows as a target
 * slot other than the one in the toolhead, with the run's stage phrase as its step.
 *
 * @param entry - The machine as observed.
 * @returns The change, or nothing.
 * @public
 */
export const materialChange = (entry: MachineDirectoryEntry): MaterialChange | undefined => {
  const observed = observedChange(entry);
  if (observed !== undefined) {
    const at = observed.steps.findIndex((step) => step.id === observed.step);
    const current = observed.steps[at];
    return {
      kind: observed.kind,
      slot: observed.slot,
      ...(current === undefined ? {} : { step: current.label }),
      reported: {
        steps: observed.steps.map((step, index) => ({
          label: step.label,
          actor: step.actor,
          state: index < at ? 'done' : index === at ? 'active' : 'todo',
        })),
        ...(observed.awaiting === undefined ? {} : { awaiting: observed.awaiting }),
      },
    };
  }
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

/** The external holder has no reader: a material it does not report is one nobody has set, not an empty holder. */
const materialName = (material: Material, manifest: MachineManifest | undefined): string =>
  material.state === 'loaded'
    ? (material.materialId ?? 'Loaded')
    : material.slot === manifest?.materialSystem.externalSpoolSlot
      ? 'Not set'
      : material.state === 'empty'
        ? 'Empty'
        : 'Unknown';

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
  return material === undefined
    ? undefined
    : `${materialSlotLabel(material.slot, manifest)} ${materialName(material, manifest)}`;
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

/** What one slot offers now: its names, the verb, the question it asks and why each action waits. */
type SlotPlan = Readonly<{
  label: string;
  name: string;
  isExternal: boolean;
  isCurrent: boolean;
  /** Whether the material system read the spool's tag, which sets its material. */
  isTagged: boolean;
  verb: 'load' | 'unload';
  buttonLabel: string;
  confirmLabel: string;
  question: string;
  /** Why loading or unloading waits; nothing when it can be taken. */
  wait: string | undefined;
  /** Why setting the material waits; nothing when it can be set. */
  setWait: string | undefined;
}>;

/**
 * The plan for one slot from the observation: load what is not in the toolhead, unload what is, and set the material
 * of a spool its tag does not identify.
 *
 * @param input - The machine, its manifest, the slot and the declared actions' availability.
 * @returns The plan.
 */
const slotPlan = ({
  entry,
  manifest,
  material,
  availability,
  setAvailability,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly availability: ActionAvailability | undefined;
  readonly setAvailability: ActionAvailability | undefined;
}): SlotPlan => {
  const label = materialSlotLabel(material.slot, manifest);
  const name = materialName(material, manifest);
  const isExternal = material.slot === manifest?.materialSystem.externalSpoolSlot;
  const isTagged = observedSlot(material).identifiedBy === 'tag';
  const currentSlot = entry.snapshot.materialSystem?.currentSlot;
  const isCurrent = currentSlot === material.slot;
  const current = entry.snapshot.setup.materials.find((candidate) => candidate.slot === currentSlot);
  const goesBack = current === undefined ? '' : ` and ${materialSlotLabel(current.slot, manifest)} goes back first`;
  const change = materialChange(entry);
  const canSet = setAvailability !== undefined;
  const emptyWait = isExternal
    ? `Set the material of the spool on the holder${canSet ? '' : ' on the printer'} first, so the nozzle heats for it.`
    : `Put a spool in ${label}; the AMS reads a Bambu spool's tag${canSet ? ', and you set any other spool here' : ''}.`;
  const busyWait = (own: ActionAvailability | undefined): string | undefined =>
    entry.snapshot.activeRunId === undefined
      ? change === undefined
        ? describeWaits([own])[0]
        : 'Wait for the filament change to finish.'
      : 'Filament changes wait until the run ends.';
  const setWait = isTagged ? `The AMS read this spool's tag, which sets its material.` : busyWait(setAvailability);
  if (isCurrent) {
    return {
      label,
      name,
      isExternal,
      isCurrent,
      isTagged,
      verb: 'unload',
      buttonLabel: 'Unload',
      confirmLabel: `Unload ${label}`,
      question: `Unload ${label} (${name})? The nozzle heats so the filament can retract${isExternal ? '; pull it out of the toolhead once it stops.' : ` into ${label}.`}`,
      wait: busyWait(availability),
      setWait,
    };
  }
  return {
    label,
    name,
    isExternal,
    isCurrent,
    isTagged,
    verb: 'load',
    buttonLabel: isExternal ? 'Feed into toolhead' : 'Load into toolhead',
    confirmLabel: `${isExternal ? 'Feed' : 'Load'} ${label}`,
    question: isExternal
      ? `Feed the external ${name}? The nozzle heats for ${name}${goesBack}; then push the filament into the toolhead when asked.`
      : `Load ${label} (${name}) into the toolhead? The nozzle heats for ${name}${goesBack}.`,
    wait: material.state === 'loaded' ? busyWait(availability) : emptyWait,
    setWait,
  };
};

/** A profile id by the preset name the printer declares for it, else as reported. */
const profileName = (profileId: string | undefined, manifest: MachineManifest | undefined): string | undefined =>
  profileId === undefined
    ? undefined
    : (materialPresets(manifest).find((preset) => preset.const === profileId)?.title ?? profileId);

/**
 * What the slot holds and where: the swatch, the material, the place, then its remaining, colour, profile, nozzle
 * range and the AMS unit's humidity and temperature.
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
  const { nozzleTemperature } = observedSlot(material);
  const profile = profileName(material.profileId, manifest);
  const place = plan.isCurrent ? 'In the toolhead' : plan.isExternal ? 'On the external holder' : 'In the AMS';
  return (
    <>
      <div className='flex min-w-0 items-center gap-2.5'>
        <SlotSwatch material={material} size='lg' />
        <div className='flex min-w-0 flex-1 flex-col'>
          <p className='truncate text-sm font-medium'>
            <span className='font-mono'>{plan.label}</span> · {plan.name}
          </p>
          <p className='truncate text-xs text-muted-foreground'>
            {plan.isTagged ? `${place} · read from its tag` : place}
          </p>
        </div>
      </div>
      <dl className='flex flex-col gap-0.5'>
        {material.remainingPercent === undefined ? null : (
          <PrintRow label='Remaining'>{material.remainingPercent} %</PrintRow>
        )}
        {material.color === undefined ? null : <PrintRow label='Colour'>{material.color.slice(0, 7)}</PrintRow>}
        {profile === undefined ? null : <PrintRow label='Profile'>{profile}</PrintRow>}
        {nozzleTemperature === undefined ? null : (
          <PrintRow label='Nozzle'>
            {nozzleTemperature.min}–{nozzleTemperature.max} °C
          </PrintRow>
        )}
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

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- data: the colour a spool without one starts from
const unsetSpoolColor = '#FFFFFF';
const hexColor = /^#[\da-f]{6}$/iu;

/**
 * Set the material of a spool its tag does not identify: one of the presets the printer declares, and its colour. The
 * printer heats the nozzle for the preset's range, so the form asks for nothing else.
 *
 * @param properties - The slot, its plan, the presets and the two answers.
 * @returns The form.
 */
function MaterialForm({
  material,
  plan,
  presets,
  isBusy,
  onSave,
  onCancel,
}: {
  readonly material: Material;
  readonly plan: SlotPlan;
  readonly presets: readonly MaterialPreset[];
  readonly isBusy: boolean;
  readonly onSave: (choice: Readonly<{ profile: string; color: string }>) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [profile, setProfile] = useState(
    () => presets.find((preset) => preset.const === material.profileId)?.const ?? presets[0]?.const ?? '',
  );
  const [color, setColor] = useState(material.color?.slice(0, 7) ?? unsetSpoolColor);
  const isColorValid = hexColor.test(color);
  return (
    <form
      aria-label={`Set the material in ${plan.label}`}
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 p-2'
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ profile, color: color.toUpperCase() });
      }}
    >
      <div className='-my-1.5 flex min-w-0 flex-col'>
        <PrintSetupRow label='Material'>
          <ParameterSelect
            label='Material'
            value={profile}
            shouldAutoFocus
            groups={[{ options: presets.map((preset) => ({ value: preset.const, label: preset.title })) }]}
            onChange={setProfile}
          />
        </PrintSetupRow>
        <PrintSetupRow label='Colour'>
          <StringColorPicker aria-label='Colour' value={color} onChange={setColor} />
        </PrintSetupRow>
      </div>
      {isColorValid ? null : <p className='text-xs text-muted-foreground'>Choose a colour as #RRGGBB.</p>}
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' size='sm' disabled={isBusy || !isColorValid || profile === ''}>
          {isBusy ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
          Save
        </Button>
        <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** What a sent action is, in the words that wait for it: "Waiting for Workshop X1C to confirm the load…". */
const sentNoun = { load: 'load', unload: 'unload', set: 'material' } as const;

/** An accepted action until the printer reports it. */
type Sent = Readonly<{
  verb: keyof typeof sentNoun;
  at: number;
  /** The slot in the toolhead when a load or unload was sent. */
  currentSlot?: number;
  /** The preset and colour a material setting sent. */
  material?: Readonly<{ profile: string; color: string }>;
}>;

/**
 * The slot's actions and their moments: offered, confirming or editing, sent, and in progress as the printer reports
 * it. An action the printer has not reported in time says so, as an unconfirmed print start does; nothing is resent.
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
  setAvailability,
  apply,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly material: Material;
  readonly plan: SlotPlan;
  readonly availability: ActionAvailability | undefined;
  readonly setAvailability: ActionAvailability | undefined;
  readonly apply: ApplyMachineAction | undefined;
}): React.JSX.Element {
  const [moment, setMoment] = useState<'offered' | 'confirming' | 'editing'>('offered');
  const [sent, setSent] = useState<Sent>();
  const now = useNow();
  const action = useMachineAction(entry, apply);
  const currentSlot = entry.snapshot.materialSystem?.currentSlot;
  const change = materialChange(entry);
  const presets = materialPresets(manifest);
  /* A sent action the printer has not reported yet: a load or unload shows as a change, a material as the slot's. */
  const pending =
    sent === undefined ||
    (sent.material === undefined
      ? change !== undefined || sent.currentSlot !== currentSlot
      : material.profileId === sent.material.profile &&
        (material.color ?? '').slice(0, 7).toUpperCase() === sent.material.color)
      ? undefined
      : sent;
  const confirm = async (): Promise<void> => {
    const sending: Sent = { verb: plan.verb, at: Date.now(), ...(currentSlot === undefined ? {} : { currentSlot }) };
    // Unload names the slot it shows, so the host can hold it to the printer's report (machine-actions guide).
    const isAccepted = await action.run(`material.${plan.verb}`, { slot: material.slot });
    setMoment('offered');
    setSent(isAccepted ? sending : undefined);
  };
  const save = async (choice: Readonly<{ profile: string; color: string }>): Promise<void> => {
    const isAccepted = await action.run('material.set', { slot: material.slot, ...choice });
    if (isAccepted) {
      setMoment('offered');
      setSent({ verb: 'set', at: Date.now(), material: choice });
    }
  };
  const error = action.error ? <PrintNotice tone='destructive'>{action.error}</PrintNotice> : null;

  if (pending !== undefined && now - pending.at < reportWithin) {
    return (
      <p role='status' className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
        <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
        Waiting for {entry.name} to confirm the {sentNoun[pending.verb]}…
      </p>
    );
  }
  if (moment === 'confirming') {
    return (
      <SlotConfirmation
        plan={plan}
        isBusy={action.pending !== undefined}
        onConfirm={() => {
          void confirm();
        }}
        onKeep={() => {
          setMoment('offered');
        }}
      />
    );
  }
  if (moment === 'editing') {
    return (
      <>
        <MaterialForm
          material={material}
          plan={plan}
          presets={presets}
          isBusy={action.pending !== undefined}
          onSave={(choice) => {
            void save(choice);
          }}
          onCancel={() => {
            setMoment('offered');
          }}
        />
        {error}
      </>
    );
  }
  return (
    <>
      <OfferedActions
        material={material}
        plan={plan}
        availability={availability}
        setAvailability={setAvailability}
        hasPresets={presets.length > 0}
        isChanging={change !== undefined}
        onAct={() => {
          setMoment('confirming');
        }}
        onSetMaterial={() => {
          setMoment('editing');
        }}
      />
      {pending === undefined ? null : (
        <p role='status' className='text-xs text-muted-foreground'>
          {entry.name} has not confirmed the {sentNoun[pending.verb]} yet. Check its screen before trying again; Tau did
          not resend it.
        </p>
      )}
      {error}
    </>
  );
}

/**
 * What a slot offers at rest: loading, feeding or unloading it, and setting its material, each disabled with its
 * reason while it waits. A spool nobody has set has nothing to load yet, so setting its material leads.
 *
 * @param properties - The slot, its plan, the declared actions' availability and the two openings.
 * @returns The buttons and their reasons.
 */
function OfferedActions({
  material,
  plan,
  availability,
  setAvailability,
  hasPresets,
  isChanging,
  onAct,
  onSetMaterial,
}: {
  readonly material: Material;
  readonly plan: SlotPlan;
  readonly availability: ActionAvailability | undefined;
  readonly setAvailability: ActionAvailability | undefined;
  /** Whether the printer declares presets to set a material from. */
  readonly hasPresets: boolean;
  /** Whether a filament change is in progress on another slot. */
  readonly isChanging: boolean;
  readonly onAct: () => void;
  readonly onSetMaterial: () => void;
}): React.JSX.Element {
  const waitId = useId();
  const setWaitId = useId();
  const showsAct = material.state === 'loaded' && availability !== undefined;
  const showsSet = setAvailability !== undefined && hasPresets;
  const canAct = plan.wait === undefined && availability?.isAvailable === true && !isChanging;
  const canSet = plan.setWait === undefined && setAvailability?.isAvailable === true && !isChanging;
  /* Both buttons may wait for the same reason; it shows once and describes both. */
  const idFor = (wait: string): string => (wait === plan.wait ? waitId : setWaitId);
  const waits = [...new Set([plan.wait, showsSet ? plan.setWait : undefined])].filter((wait) => wait !== undefined);
  return (
    <>
      <div className='flex flex-wrap gap-2'>
        {showsAct ? (
          <Button
            type='button'
            size='sm'
            variant={plan.isCurrent ? 'outline' : 'default'}
            disabled={!canAct}
            aria-describedby={plan.wait === undefined ? undefined : idFor(plan.wait)}
            onClick={onAct}
          >
            {plan.isCurrent ? <ArrowUpFromLine aria-hidden /> : <ArrowDownToLine aria-hidden />}
            {plan.buttonLabel}
          </Button>
        ) : null}
        {showsSet ? (
          <Button
            type='button'
            size='sm'
            variant={material.state === 'loaded' ? 'outline' : 'default'}
            disabled={!canSet}
            aria-describedby={plan.setWait === undefined ? undefined : idFor(plan.setWait)}
            onClick={onSetMaterial}
          >
            <Palette aria-hidden />
            Set material
          </Button>
        ) : null}
      </div>
      {waits.map((wait) => (
        <p key={wait} id={idFor(wait)} className='text-xs text-muted-foreground'>
          {wait}
        </p>
      ))}
    </>
  );
}

/**
 * One slot opened from the list: what is in it, where it is, and what can be done with it. Loading and unloading ask
 * once, then follow the printer's report; setting a spool's material opens a short form in place.
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
  const setAvailability = actionAvailability({ entry, manifest, action: 'material.set', apply });
  const plan = slotPlan({ entry, manifest, material, availability, setAvailability });
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
        setAvailability={setAvailability}
        apply={apply}
      />
    </div>
  );
}

/** What the printer waits on, as the change's status announces it. */
const awaitingSentence = {
  feed: 'waits for you to push the filament in.',
  confirmation: 'asks whether the filament comes out of the nozzle.',
} as const;

/**
 * The change's slot as its card names it: "Feeding Ext", "PETG".
 *
 * @param entry - The machine as observed.
 * @param manifest - Its manifest, for slot names.
 * @param change - The change in progress.
 * @returns The title, the material's name and whether the slot is the external spool.
 */
const changeNames = (
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
  change: MaterialChange,
): Readonly<{ title: string; name: string; isExternal: boolean }> => {
  const material = entry.snapshot.setup.materials.find((candidate) => candidate.slot === change.slot);
  const label = materialSlotLabel(change.slot, manifest);
  const isExternal = change.slot === manifest?.materialSystem.externalSpoolSlot;
  const verb = change.kind === 'unload' ? 'Unloading' : isExternal ? 'Feeding' : 'Loading';
  return {
    title: `${verb} ${label}`,
    name: material === undefined ? label : materialName(material, manifest),
    isExternal,
  };
};

/** The change the card shows: during a run, the run line names an AMS change the printer does not report. */
const shownChange = (entry: MachineDirectoryEntry): MaterialChange | undefined => {
  const change = materialChange(entry);
  return change?.reported === undefined && entry.snapshot.activeRunId !== undefined ? undefined : change;
};

/**
 * The printer's extrusion check: Done when the filament comes out of the nozzle, Retry to extrude again. One per
 * prompt, so an answered prompt waits for the printer and the next prompt asks again.
 *
 * @param properties - The material's name, the printer's, whether the pane can answer, and the answer.
 * @returns The check.
 */
function ExtrusionCheck({
  name,
  printer,
  isAvailable,
  isBusy,
  onAnswer,
}: {
  readonly name: string;
  readonly printer: string;
  readonly isAvailable: boolean;
  readonly isBusy: boolean;
  readonly onAnswer: (answer: 'extruded' | 'retry') => Promise<boolean>;
}): React.JSX.Element {
  const [isAnswered, setIsAnswered] = useState(false);
  const answer = async (value: 'extruded' | 'retry'): Promise<void> => {
    setIsAnswered(await onAnswer(value));
  };
  return (
    <div role='group' aria-label='Check the extrusion' className='flex min-w-0 flex-col gap-2 text-xs'>
      <p>
        Is {name} coming out of the nozzle?{' '}
        {isAvailable ? 'Done when it is; Retry extrudes again.' : "Answer on the printer's screen."}
      </p>
      {isAvailable && isAnswered ? (
        <p role='status' className='flex items-center gap-2 text-muted-foreground'>
          <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
          Waiting for {printer} to continue…
        </p>
      ) : null}
      {isAvailable && !isAnswered ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            size='sm'
            disabled={isBusy}
            onClick={() => {
              void answer('extruded');
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
              void answer('retry');
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A filament change in progress, beside a print start in progress and outside the stages, because it may need the
 * person: its steps when the printer names them, with the prompt it waits on. Feeding the external spool needs the
 * person twice: they push the filament in, then say whether it came out of the nozzle. Done and Retry show only while
 * the printer asks, and each answer names that prompt.
 *
 * @param properties - The machine, its manifest and the action seam.
 * @returns The card, or nothing without a change to show.
 * @public
 */
export function MaterialChangeCard({
  entry,
  manifest,
  apply,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly apply: ApplyMachineAction | undefined;
}): React.JSX.Element | undefined {
  const action = useMachineAction(entry, apply);
  const cardRef = useRef<HTMLElement>(null);
  const change = shownChange(entry);
  /* The change and each prompt come into view wherever the person scrolled, as the slot that started it may have. */
  const moment =
    change === undefined ? '' : `${change.kind}:${String(change.slot)}:${change.reported?.awaiting?.promptId ?? ''}`;
  useEffect(() => {
    if (moment !== '') {
      cardRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [moment]);
  if (change === undefined) {
    return undefined;
  }
  const { title, name, isExternal } = changeNames(entry, manifest, change);
  const { reported } = change;
  const awaiting = reported?.awaiting;
  return (
    <section
      ref={cardRef}
      aria-label='Filament change'
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-card p-3'
    >
      <p role='status' className='flex min-w-0 items-center gap-2 text-sm'>
        <LoaderCircle aria-hidden className='size-4 shrink-0 animate-spin motion-reduce:animate-none' />
        <span className='min-w-0 truncate'>
          {title} · {name}…
        </span>
        {/* The status persists, so the moment the printer asks is announced. */}
        <span className='sr-only'>
          {awaiting === undefined ? '' : ` ${entry.name} ${awaitingSentence[awaiting.kind]}`}
        </span>
      </p>
      {reported === undefined ? (
        change.step === undefined ? null : (
          <p className='text-xs text-muted-foreground'>{change.step}</p>
        )
      ) : (
        <PrintSteps steps={reported.steps} layout='list' />
      )}
      {awaiting?.kind === 'feed' ? (
        <p className='text-xs'>
          Push the {name} into the toolhead until the extruder grips it; {entry.name} carries on by itself.
        </p>
      ) : null}
      {awaiting?.kind === 'confirmation' ? (
        <ExtrusionCheck
          key={awaiting.promptId}
          name={name}
          printer={entry.name}
          isAvailable={
            actionAvailability({ entry, manifest, action: 'material.continue', apply })?.isAvailable === true
          }
          isBusy={action.pending !== undefined}
          onAnswer={async (answer) => action.run('material.continue', { promptId: awaiting.promptId, answer })}
        />
      ) : null}
      {reported === undefined && change.kind === 'load' && isExternal ? (
        /* Without the printer's steps the pane cannot tell when it asks, so the answer stays on its screen. */
        <p className='text-xs'>
          Once the nozzle is hot, push the {name} into the toolhead until the extruder grips it, then confirm on the
          printer&apos;s screen.
        </p>
      ) : null}
      {action.error ? <PrintNotice tone='destructive'>{action.error}</PrintNotice> : null}
    </section>
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
                    {materialName(slot, manifest)}
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
