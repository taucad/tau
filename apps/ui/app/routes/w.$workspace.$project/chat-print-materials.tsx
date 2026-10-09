import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, Layers, LoaderCircle } from 'lucide-react';
import type {
  CalibrationProfile,
  MachineDirectoryEntry,
  MaterialSlotAddress,
  MaterialSlotSnapshot,
  SlotMaterial,
} from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import {
  declaredSlots,
  formatQuantity,
  isExternalSlot,
  materialSystemOf,
  materialSystemValue,
  sameSlot,
  slotLabel,
  toolheadOf,
} from '#components/print/machine-facts.js';
import type { MaterialSystemComponent } from '#components/print/machine-facts.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { StringColorPicker } from '#components/ui/string-color-picker.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import {
  ActionButton,
  Blocked,
  Consequences,
  declaredAction,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PrintRow, PrintStage, StaleBadge } from '#routes/w.$workspace.$project/chat-print-section.js';

/**
 * What a slot holds, in a few words: the material, or why there is none.
 *
 * @param slot - The slot as observed.
 * @param isExternal - Whether it is an external holder, which cannot tell empty from unset.
 * @returns "PLA", "Empty", "Not set" or "Unknown".
 * @public
 */
export const slotName = (slot: MaterialSlotSnapshot, isExternal: boolean): string =>
  slot.material === undefined
    ? slot.state === 'empty'
      ? 'Empty'
      : isExternal || slot.identifiedBy === 'unset'
        ? 'Not set'
        : 'Unknown'
    : [slot.material.brand, slot.material.materialType].filter(Boolean).join(' ');

/**
 * The slot in the toolhead, as a closed Monitor's summary says it: "A1 PLA".
 *
 * @param entry - The machine as observed.
 * @returns The phrase, or nothing while no slot is in use.
 * @public
 */
export const materialInUse = (entry: MachineDirectoryEntry): string | undefined => {
  const system = materialSystemOf(entry.descriptor.capabilities);
  const value = materialSystemValue(entry);
  const current = value?.routes.find((route) => route.current !== null)?.current;
  const slot =
    current === null || current === undefined
      ? undefined
      : value?.slots.find((candidate) => sameSlot(candidate.slot, current));
  return slot === undefined
    ? undefined
    : `${slotLabel(system, slot.slot)} ${slotName(slot, isExternalSlot(system, slot.slot))}`;
};

function SlotSwatch({
  material,
  isLarge = false,
}: {
  readonly material: SlotMaterial | undefined;
  readonly isLarge?: boolean;
}): React.JSX.Element {
  return material === undefined ? (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-full border border-dashed border-muted-foreground/60',
        isLarge ? 'size-8' : 'size-4',
      )}
    />
  ) : (
    <span className={cn('flex shrink-0', isLarge && '[&>[data-slot=material-swatch]]:size-8')}>
      <MaterialSwatch materials={[{ color: material.color.slice(0, 7), roughness: 0.35, metalness: 0 }]} />
    </span>
  );
}

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

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- data: the colour a spool without one starts from
const unsetSpoolColor = '#FFFFFF';
const hexColor = /^#[\da-f]{6}$/iu;
const materialTypes = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PVA', 'HIPS'] as const;

/**
 * Set a slot's material: type, colour, the vendor preset it prints with and its nozzle range. The colour is sent as
 * `#RRGGBBAA`, opaque.
 *
 * @param properties - The control, the material system, the slot and the way back.
 * @returns The form.
 */
function MaterialForm({
  control,
  systemId,
  slot,
  label,
  onClose,
}: {
  readonly control: MachineControl;
  readonly systemId: string;
  readonly slot: MaterialSlotSnapshot;
  readonly label: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const current = slot.material;
  const [materialType, setMaterialType] = useState(current?.materialType ?? 'PLA');
  const [color, setColor] = useState(current?.color.slice(0, 7) ?? unsetSpoolColor);
  const [profileId, setProfileId] = useState(current?.preset.profileId ?? '');
  const [settingId, setSettingId] = useState(current?.preset.settingId ?? '');
  const [minimum, setMinimum] = useState(String(current?.nozzleTemperature?.min.value ?? 190));
  const [maximum, setMaximum] = useState(String(current?.nozzleTemperature?.max.value ?? 230));
  const range = { min: Number(minimum), max: Number(maximum) };
  const isValid =
    hexColor.test(color) &&
    profileId.trim() !== '' &&
    Number.isFinite(range.min) &&
    Number.isFinite(range.max) &&
    range.min > 0 &&
    range.min <= range.max &&
    range.max <= 500;
  const field = ({
    name,
    value,
    set,
    type = 'text',
  }: Readonly<{
    name: string;
    value: string;
    set: (value: string) => void;
    type?: 'text' | 'number';
  }>): React.JSX.Element => (
    <Input
      aria-label={name}
      type={type}
      className='h-6 text-xs'
      value={value}
      onChange={(event) => {
        set(event.target.value);
      }}
    />
  );
  return (
    <form
      aria-label={`Set the material in ${label}`}
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 p-2'
      onSubmit={(event) => {
        event.preventDefault();
        const send = async (): Promise<void> => {
          const isAccepted = await control.apply(systemId, 'material.set', {
            slot: slot.slot,
            material: {
              materialType,
              color: `${color.toUpperCase()}FF`,
              preset: { profileId: profileId.trim(), settingId: settingId.trim() },
              nozzleTemperature: range,
            },
          });
          if (isAccepted) {
            onClose();
          }
        };
        void send();
      }}
    >
      <div className='-my-1.5 flex min-w-0 flex-col'>
        <PrintSetupRow label='Material'>
          <ParameterSelect
            label='Material'
            value={materialType}
            shouldAutoFocus
            groups={[
              { options: [...new Set([...materialTypes, materialType])].map((type) => ({ value: type, label: type })) },
            ]}
            onChange={setMaterialType}
          />
        </PrintSetupRow>
        <PrintSetupRow label='Colour'>
          <StringColorPicker aria-label='Colour' value={color} onChange={setColor} />
        </PrintSetupRow>
        <PrintSetupRow label='Filament profile' description='The vendor preset id, such as GFA01.'>
          {field({ name: 'Filament profile', value: profileId, set: setProfileId })}
        </PrintSetupRow>
        <PrintSetupRow label='Preset setting'>
          {field({ name: 'Preset setting', value: settingId, set: setSettingId })}
        </PrintSetupRow>
        <PrintSetupRow label='Nozzle from (°C)'>
          {field({ name: 'Minimum nozzle temperature', value: minimum, set: setMinimum, type: 'number' })}
        </PrintSetupRow>
        <PrintSetupRow label='Nozzle to (°C)'>
          {field({ name: 'Maximum nozzle temperature', value: maximum, set: setMaximum, type: 'number' })}
        </PrintSetupRow>
      </div>
      {isValid ? null : (
        <p className='text-xs text-muted-foreground'>
          Choose a #RRGGBB colour, a profile and a nozzle range up to 500 °C.
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' size='sm' disabled={!isValid || control.pending !== undefined}>
          {control.pending === `${systemId}:material.set` ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : null}
          Save
        </Button>
        <Button type='button' size='sm' variant='outline' onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Operation states that still wait for the machine. */
const unsettled: ReadonlySet<string> = new Set(['sending', 'confirming', 'attention']);

/**
 * One slot opened from the list: what is in it and what can be done with it. A load or unload asks once before the
 * nozzle heats; a material is set in a short form in place.
 *
 * @param properties - The control, the material system, the slot and the way back.
 * @returns The slot's detail.
 */
function SlotDetail({
  control,
  system,
  slot,
  onBack,
}: {
  readonly control: MachineControl;
  readonly system: MaterialSystemComponent;
  readonly slot: MaterialSlotSnapshot;
  readonly onBack: () => void;
}): React.JSX.Element {
  const { entry } = control;
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const [moment, setMoment] = useState<'offered' | 'confirming' | 'editing'>('offered');
  const value = materialSystemValue(entry);
  const label = slotLabel(system, slot.slot);
  const isExternal = isExternalSlot(system, slot.slot);
  const route = value?.routes.find((candidate) =>
    system.routes.some(
      (declared) => declared.unitId === slot.slot.unitId && declared.toolheadIds.includes(candidate.toolheadId),
    ),
  );
  const toolheadId =
    route?.toolheadId ??
    system.routes.find((declared) => declared.unitId === slot.slot.unitId)?.toolheadIds[0] ??
    toolheadOf(entry.descriptor.capabilities)?.id ??
    '';
  const isCurrent = sameSlot(slot.slot, route?.current);
  const verb = isCurrent ? 'material.unload' : 'material.load';
  const unit = value?.units?.find((candidate) => candidate.unitId === slot.slot.unitId);
  const profiles = value?.calibrations?.rows ?? [];
  const calibration = slot.material?.calibration;
  const nozzleId = toolheadOf(entry.descriptor.capabilities)?.nozzles[0]?.id ?? '';
  const waiting = entry.snapshot.operations.find(
    (operation) => operation.action?.componentId === system.id && unsettled.has(operation.state),
  );
  const place = isCurrent
    ? 'In the toolhead'
    : isExternal
      ? 'On the external holder'
      : `In the ${system.units.find((candidate) => candidate.id === slot.slot.unitId)?.label ?? 'feeder'}`;
  return (
    <div
      role='group'
      aria-label={`Slot ${label}`}
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
      <div className='flex min-w-0 items-center gap-2.5'>
        <SlotSwatch material={slot.material} isLarge />
        <div className='flex min-w-0 flex-1 flex-col'>
          <p className='truncate text-sm font-medium'>
            <span className='font-mono'>{label}</span> · {slotName(slot, isExternal)}
          </p>
          <p className='truncate text-xs text-muted-foreground'>
            {slot.identifiedBy === 'tag'
              ? `${place} · read from its tag`
              : slot.identifiedBy === 'person'
                ? `${place} · set by a person`
                : place}
          </p>
        </div>
      </div>
      <dl className='flex flex-col gap-0.5'>
        {slot.remainingPercent === undefined ? null : <PrintRow label='Remaining'>{slot.remainingPercent} %</PrintRow>}
        {slot.material === undefined ? null : (
          <>
            <PrintRow label='Colour'>{slot.material.color.slice(0, 7)}</PrintRow>
            <PrintRow label='Profile'>
              {slot.material.preset.profileId}
              {slot.material.preset.settingId === '' ? '' : ` · ${slot.material.preset.settingId}`}
            </PrintRow>
            {slot.material.nozzleTemperature === undefined ? null : (
              <PrintRow label='Nozzle'>
                {formatQuantity(slot.material.nozzleTemperature.min)}–
                {formatQuantity(slot.material.nozzleTemperature.max)}
              </PrintRow>
            )}
            <PrintRow label='Pressure advance'>
              {calibration?.type === 'profile'
                ? (profiles.find((profile) => profile.profileId === calibration.profileId)?.name ??
                  calibration.profileId)
                : 'Default'}
            </PrintRow>
          </>
        )}
        {unit === undefined ? null : (
          <PrintRow label='Unit'>
            {[
              unit.humidityIndex === undefined ? undefined : `humidity ${String(unit.humidityIndex)}`,
              unit.temperature === undefined ? undefined : formatQuantity(unit.temperature),
            ]
              .filter(Boolean)
              .join(' · ') || 'Not reported'}
          </PrintRow>
        )}
      </dl>
      {waiting === undefined ? null : (
        <p role='status' className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
          <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
          {waiting.state === 'attention'
            ? `${entry.name} has not confirmed “${waiting.action?.label ?? 'the change'}”. Check its screen; nothing was resent.`
            : `Waiting for ${entry.name} to confirm “${waiting.action?.label ?? 'the change'}”…`}
        </p>
      )}
      {moment === 'editing' ? (
        <MaterialForm
          control={control}
          systemId={system.id}
          slot={slot}
          label={label}
          onClose={() => {
            setMoment('offered');
          }}
        />
      ) : moment === 'confirming' ? (
        <div
          role='alertdialog'
          aria-label={`Confirm ${isCurrent ? 'unload' : 'load'}`}
          className='rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'
        >
          <p>
            {isCurrent ? `Unload ${label}?` : `Load ${label} (${slotName(slot, isExternal)}) into the toolhead?`}{' '}
            {declaredAction(entry, system.id, verb)?.consequence ?? 'The nozzle heats so the filament can move.'}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <ActionButton
              control={control}
              componentId={system.id}
              action={verb}
              parameters={{ slot: slot.slot, toolheadId }}
              label={isCurrent ? `Unload ${label}` : `Load ${label}`}
              variant='default'
              onDone={() => {
                setMoment('offered');
              }}
            />
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setMoment('offered');
              }}
            >
              Keep as is
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Blocked control={control} componentId={system.id} action={verb} />
          <div className='flex flex-wrap gap-2'>
            {slot.state === 'loaded' && declaredAction(entry, system.id, verb) !== undefined ? (
              <Button
                type='button'
                size='sm'
                variant={isCurrent ? 'outline' : 'default'}
                disabled={control.check(system.id, verb).status !== 'available'}
                onClick={() => {
                  setMoment('confirming');
                }}
              >
                {isCurrent ? <ArrowUpFromLine aria-hidden /> : <ArrowDownToLine aria-hidden />}
                {isCurrent ? 'Unload' : isExternal ? 'Feed into toolhead' : 'Load into toolhead'}
              </Button>
            ) : null}
            {declaredAction(entry, system.id, 'material.set') !== undefined && slot.editing.allowed ? (
              <Button
                type='button'
                size='sm'
                variant={slot.state === 'loaded' ? 'outline' : 'default'}
                disabled={control.check(system.id, 'material.set').status !== 'available'}
                onClick={() => {
                  setMoment('editing');
                }}
              >
                Set material
              </Button>
            ) : null}
            {slot.identifiedBy === 'person' && slot.editing.allowed ? (
              <ActionButton
                control={control}
                componentId={system.id}
                action='material.clear'
                parameters={{ slot: slot.slot }}
                variant='ghost'
              />
            ) : null}
            {slot.material === undefined ? null : (
              <ActionButton
                control={control}
                componentId={system.id}
                action='material.calibration.run'
                parameters={{ method: 'pressure-advance', slots: [slot.slot], nozzleId }}
                label='Calibrate'
                variant='ghost'
              />
            )}
          </div>
          {slot.editing.allowed || slot.editing.reason === undefined ? null : (
            <p className='text-xs text-muted-foreground'>{slot.editing.reason}</p>
          )}
          {slot.material === undefined ||
          declaredAction(entry, system.id, 'material.calibration.select') === undefined ? null : (
            <div className='-my-1.5 flex min-w-0 flex-col'>
              <PrintSetupRow label='Pressure advance'>
                <ParameterSelect
                  label='Pressure-advance profile'
                  value={calibration?.type === 'profile' ? calibration.profileId : 'default'}
                  isDisabled={control.check(system.id, 'material.calibration.select').status !== 'available'}
                  groups={[
                    {
                      options: [
                        { value: 'default', label: 'Default' },
                        ...profiles.map((profile) => ({
                          value: profile.profileId,
                          label: profile.name,
                          secondary: `K ${profile.pressureAdvance.toFixed(3)}`,
                        })),
                      ],
                    },
                  ]}
                  onChange={(profileId) => {
                    void control.apply(system.id, 'material.calibration.select', { slot: slot.slot, profileId });
                  }}
                />
              </PrintSetupRow>
            </div>
          )}
          <Consequences descriptors={[declaredAction(entry, system.id, 'material.calibration.run')]} />
        </>
      )}
    </div>
  );
}

/**
 * The material slots, one per row, each opening its own detail in place: the list slides away and the slot slides
 * in, and All slots brings the list back with focus on the row it left.
 *
 * @param properties - The control and whether the observation is stale.
 * @returns The slots, or nothing on a machine without a material system.
 * @public
 */
export function MaterialSlots({
  control,
  isStale,
}: {
  readonly control: MachineControl;
  readonly isStale: boolean;
}): React.JSX.Element | undefined {
  const { entry } = control;
  const [opened, setOpened] = useState<MaterialSlotAddress>();
  const [returnedFrom, setReturnedFrom] = useState<Readonly<{ key: string }>>();
  const rows = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (returnedFrom !== undefined) {
      rows.current.get(returnedFrom.key)?.focus();
    }
  }, [returnedFrom]);
  const system = materialSystemOf(entry.descriptor.capabilities);
  if (system === undefined) {
    return undefined;
  }
  const value = materialSystemValue(entry);
  const slots = declaredSlots(system, value);
  const keyOf = (address: MaterialSlotAddress): string => `${address.unitId}/${address.slotId}`;
  const slot = opened === undefined ? undefined : slots.find((candidate) => sameSlot(candidate.slot, opened));
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>{system.label}</h4>
        {isStale ? <StaleBadge /> : null}
      </div>
      {slot ? (
        <SlotDetail
          key={keyOf(slot.slot)}
          control={control}
          system={system}
          slot={slot}
          onBack={() => {
            setReturnedFrom({ key: keyOf(slot.slot) });
            setOpened(undefined);
          }}
        />
      ) : (
        <ul
          aria-label='Material slots'
          className={cn(
            'flex min-w-0 flex-col',
            returnedFrom !== undefined &&
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2',
          )}
        >
          {slots.map((candidate) => {
            const key = keyOf(candidate.slot);
            const isCurrent = value?.routes.some((route) => sameSlot(candidate.slot, route.current)) === true;
            const isChanging =
              value?.routes.some(
                (route) => sameSlot(candidate.slot, route.target) && !sameSlot(candidate.slot, route.current),
              ) === true;
            return (
              <li key={key}>
                <button
                  ref={(element) => {
                    if (element) {
                      rows.current.set(key, element);
                    } else {
                      rows.current.delete(key);
                    }
                  }}
                  type='button'
                  className='-mx-1 flex min-h-8 w-[calc(100%+0.5rem)] min-w-0 cursor-action items-center gap-2 rounded-md px-1 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:focus-outline motion-reduce:transition-none'
                  onClick={() => {
                    setOpened(candidate.slot);
                  }}
                >
                  <span className='max-w-28 min-w-7 shrink-0 truncate font-mono text-muted-foreground'>
                    {slotLabel(system, candidate.slot)}
                  </span>
                  <SlotSwatch material={candidate.material} />
                  <span
                    className={cn('min-w-0 flex-1 truncate', candidate.state !== 'loaded' && 'text-muted-foreground')}
                  >
                    {slotName(candidate, isExternalSlot(system, candidate.slot))}
                  </span>
                  {isChanging ? (
                    <LoaderCircle
                      aria-label='Changing'
                      className='size-3.5 shrink-0 animate-spin text-information motion-reduce:animate-none'
                    />
                  ) : isCurrent ? (
                    <Badge variant='outline' className='shrink-0'>
                      In use
                    </Badge>
                  ) : null}
                  <Remaining percent={candidate.remainingPercent} />
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

/**
 * Save a pressure-advance value typed by hand, for a preset and a nozzle.
 *
 * @param properties - The control, the material system and the nozzles.
 * @returns The form.
 */
function ManualProfileForm({
  control,
  systemId,
  nozzles,
}: {
  readonly control: MachineControl;
  readonly systemId: string;
  readonly nozzles: readonly string[];
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [profileId, setProfileId] = useState('');
  const [settingId, setSettingId] = useState('');
  const [nozzleId, setNozzleId] = useState(nozzles[0] ?? '');
  const [k, setK] = useState('0.02');
  const pressureAdvance = Number(k);
  const isValid =
    name.trim() !== '' && profileId.trim() !== '' && nozzleId !== '' && pressureAdvance > 0 && pressureAdvance < 2;
  return (
    <form
      aria-label='Save a pressure-advance profile'
      className='flex min-w-0 flex-col gap-2'
      onSubmit={(event) => {
        event.preventDefault();
        void control.apply(systemId, 'material.calibration.save', {
          source: 'manual',
          name: name.trim(),
          preset: { profileId: profileId.trim(), settingId: settingId.trim() },
          nozzleId,
          pressureAdvance,
        });
      }}
    >
      <div className='-my-1.5 flex min-w-0 flex-col'>
        {(
          [
            ['Name', name, setName],
            ['Filament profile', profileId, setProfileId],
            ['Preset setting', settingId, setSettingId],
            ['Pressure advance (K)', k, setK],
          ] as const
        ).map(([label, value, set]) => (
          <PrintSetupRow key={label} label={label}>
            <Input
              aria-label={label}
              className='h-6 text-xs'
              value={value}
              maxLength={label === 'Name' ? 40 : undefined}
              inputMode={label === 'Pressure advance (K)' ? 'decimal' : undefined}
              onChange={(event) => {
                set(event.target.value);
              }}
            />
          </PrintSetupRow>
        ))}
        {nozzles.length > 1 ? (
          <PrintSetupRow label='Nozzle'>
            <ParameterSelect
              label='Nozzle'
              value={nozzleId}
              groups={[{ options: nozzles.map((id) => ({ value: id, label: id })) }]}
              onChange={setNozzleId}
            />
          </PrintSetupRow>
        ) : null}
      </div>
      <div>
        <Button
          type='submit'
          size='sm'
          variant='outline'
          disabled={!isValid || control.check(systemId, 'material.calibration.save').status !== 'available'}
        >
          Save profile
        </Button>
      </div>
    </form>
  );
}

/**
 * Pressure advance: the machine-held profile table, each row deletable, and a value saved by hand. Shown only on a
 * machine that keeps such a table.
 *
 * @param properties - The control.
 * @returns The stage, or nothing.
 * @public
 */
export function PressureAdvanceStage({ control }: { readonly control: MachineControl }): React.JSX.Element | undefined {
  const { entry } = control;
  const system = materialSystemOf(entry.descriptor.capabilities);
  const table = materialSystemValue(entry)?.calibrations;
  if (system === undefined || table === undefined) {
    return undefined;
  }
  const nozzles = toolheadOf(entry.descriptor.capabilities)?.nozzles.map((nozzle) => nozzle.id) ?? [];
  const row = (profile: CalibrationProfile): React.JSX.Element => (
    <PrintRow
      key={profile.profileId}
      label={profile.name}
      badge={
        <ActionButton
          control={control}
          componentId={system.id}
          action='material.calibration.delete'
          parameters={{ profileId: profile.profileId }}
          label='Delete'
          variant='ghost'
          ariaLabel={`Delete ${profile.name}`}
        />
      }
    >
      K {profile.pressureAdvance.toFixed(3)} · {profile.preset.profileId} · {profile.nozzleId}
    </PrintRow>
  );
  return (
    <PrintStage
      icon={Layers}
      title='Pressure advance'
      summary={`${String(table.rows.length)} ${table.rows.length === 1 ? 'profile' : 'profiles'}`}
    >
      {table.rows.length === 0 ? (
        <p className='text-xs text-muted-foreground'>No saved profiles; every slot uses the default.</p>
      ) : (
        <dl className='flex flex-col gap-1'>{table.rows.map(row)}</dl>
      )}
      {declaredAction(entry, system.id, 'material.calibration.save') === undefined ? null : (
        <ManualProfileForm control={control} systemId={system.id} nozzles={nozzles} />
      )}
      <p className='text-xs text-muted-foreground'>
        {entry.name} keeps these per nozzle{table.capacity === undefined ? '' : `, up to ${String(table.capacity)}`}; a
        change from another app updates this list.
      </p>
    </PrintStage>
  );
}
