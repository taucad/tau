/**
 * Machine details for Settings › Compute › Machines, drawn from the provider's
 * manifest alone (blueprint D7, R3).
 *
 * Every part of the manifest is a folded row whose one-line summary orients a
 * newcomer; opening it shows the exact declared values an engineer inspects:
 * identity and qualification profiles, the connection, axes and components,
 * each process, how jobs reach the machine, what Stop does, and every declared
 * control with its qualification and who may use it. The binding and job
 * submission configurations render through the shared Parameters renderer from
 * their native JSON Structure declarations, read-only: the host offers no
 * change to a binding once it exists, and each job chooses its own submission
 * values in the Print pane. Nothing here names a vendor or a model, so a second
 * provider's manifest renders the same way.
 *
 * @module
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { getDefaultFormState } from '@rjsf/utils';
import type { RJSFSchema } from '@rjsf/utils';
import { Ban, ShieldCheck, ShieldQuestion, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import type { ConfigurationManifestV1 } from '@taucad/runtime/configuration';
import { fffProcessOf, isSimulatedMachine, millingProcessOf } from '@taucad/runtime/machine';
import type {
  MachineActionDescriptor,
  MachineActionEffect,
  MachineAuthority,
  MachineAxis,
  MachineComponent,
  MachineFffProcess,
  MachineManifest,
  MachineMillingProcess,
  MachineProvider,
  MachineRemedy,
} from '@taucad/runtime/machine';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@taucad/ui/components/accordion';
import { cn } from '@taucad/ui/utils/cn';
import { sha256StringSync } from '@taucad/utils/hash';
import { isRecord } from '@taucad/utils/schema';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { ParameterEdit, Units } from '#components/geometry/parameters/rjsf-context.js';
import { rjsfDefaultFormStateBehavior } from '#components/geometry/parameters/rjsf-utils.js';
import { describeOutcome, formatQuantity } from '#components/print/machine-facts.js';
import { rjsfValidator } from '#lib/rjsf-validator.js';

type Geometry = MachineFffProcess['geometry'];
type QualificationStatus = MachineActionDescriptor['qualification']['status'];

const kinematicsLabels: Readonly<Record<Geometry['kinematics'], string>> = {
  corexy: 'CoreXY',
  'cartesian-bedslinger': 'Cartesian, moving bed',
  'cartesian-gantry': 'Cartesian gantry',
  delta: 'Delta',
};
const bedMotionLabels: Readonly<Record<Geometry['bedMotion'], string>> = {
  z: 'Bed moves on Z',
  y: 'Bed moves on Y',
  none: 'Bed stays fixed',
};
const originLabels: Readonly<Record<Geometry['origin'], string>> = {
  'front-left': 'Front-left corner',
  center: 'Center of the bed',
};
const doorLabels: Readonly<Record<Geometry['enclosure']['doors'][number], string>> = {
  front: 'Front',
  top: 'Top',
  side: 'Side',
};
const millingFeatureLabels: Readonly<Record<MachineMillingProcess['features'][number], string>> = {
  'tool-centre-point': 'Tool centre point',
  'tilted-plane': 'Tilted plane',
  'cutter-compensation': 'Cutter compensation',
  'canned-cycles': 'Canned cycles',
  arcs: 'Arcs',
};
const nozzleMaterialLabels: Readonly<
  Record<Extract<MachineComponent, { kind: 'toolhead' }>['nozzles'][number]['material'], string>
> = {
  hardened: 'Hardened steel',
  stainless: 'Stainless steel',
};
const kindLabels: Readonly<Record<MachineComponent['kind'], string>> = {
  controller: 'Controller',
  light: 'Light',
  fan: 'Fan',
  heater: 'Heater',
  coolant: 'Coolant',
  air: 'Air blast',
  vacuum: 'Vacuum',
  extraction: 'Dust extraction',
  override: 'Override',
  'speed-profile': 'Speed profile',
  camera: 'Camera',
  storage: 'Storage',
  enclosure: 'Enclosure',
  laser: 'Laser',
  motion: 'Motion',
  spindle: 'Spindle',
  tools: 'Tools',
  probe: 'Probe',
  toolhead: 'Toolhead',
  'material-system': 'Material system',
  interlock: 'Interlock',
  vendor: 'Vendor part',
};
const effectLabels: Readonly<Record<MachineActionEffect, string>> = {
  none: 'No physical effect',
  observe: 'Observation',
  illumination: 'Light',
  configuration: 'Configuration',
  coordinates: 'Coordinates',
  motion: 'Motion',
  thermal: 'Heat',
  material: 'Material',
  spindle: 'Spindle',
  laser: 'Laser',
  fluid: 'Fluid',
  storage: 'Storage',
  run: 'Run',
};
const authorityLabels: Readonly<Record<MachineAuthority, string>> = {
  agent: 'Anyone, including an agent',
  'approved-agent': 'A person, or an agent a person approved',
  person: 'A person only',
};
const qualificationLabels: Readonly<Record<QualificationStatus, string>> = {
  qualified: 'Qualified',
  designed: 'Designed, not yet qualified',
  unsupported: 'Unsupported',
};
const qualificationGlyphs: Readonly<Record<QualificationStatus, LucideIcon>> = {
  qualified: ShieldCheck,
  designed: Wrench,
  unsupported: Ban,
};
const qualificationOrder: readonly QualificationStatus[] = ['qualified', 'designed', 'unsupported'];

/** Machines settings show native millimetres, as the manifests declare them. */
const configurationUnits: Units = { length: { displaySymbol: 'mm' } };
const transientEdit: ParameterEdit = { kind: 'transient' };
const noValues: Record<string, unknown> = {};
const noFields: readonly string[] = [];
/** A read-only form keeps nothing: the host offers no update for a configuration it shows. */
const keepDeclaredValues = (): void => undefined;

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No');
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
const formatSize = ({ x, y, z }: Geometry['buildVolume'], unit = 'mm'): string => `${x} × ${y} × ${z} ${unit}`;
const enclosureLabel = (enclosed: boolean): string => (enclosed ? 'Enclosed' : 'Open frame');
const listed = (items: readonly string[], none: string, separator = ', '): string =>
  items.length > 0 ? items.join(separator) : none;

/**
 * An observation budget in the unit people read it in: "15 s", "2 min".
 *
 * @param staleAfter - Milliseconds.
 * @returns The budget.
 */
const formatStaleAfter = (staleAfter: number): string =>
  staleAfter < 60_000 ? `${staleAfter / 1000} s` : `${staleAfter / 60_000} min`;

/**
 * The fields a provider configuration declares, by key.
 *
 * @param configuration - The declared configuration.
 * @returns Its top-level field keys; none when its schema cannot be read.
 */
export const fieldNames = (configuration: ConfigurationManifestV1): readonly string[] => {
  const projection = configuration.parameters.input;
  const properties = projection.status === 'usable' ? projection.declaration.schema['properties'] : undefined;
  return typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
};

const countFields = (configuration: ConfigurationManifestV1): number => fieldNames(configuration).length;

const axisSummary = ({ kind, unit, travel, carries }: MachineAxis): string =>
  [
    kind === 'linear' ? 'Linear' : 'Rotary',
    travel === undefined ? undefined : `${travel.min} to ${travel.max} ${unit}`,
    carries === 'tool' ? 'moves the tool' : 'moves the work',
  ]
    .filter((part) => part !== undefined)
    .join(', ');

/** What one component is, in a phrase: its kind and the facts its kind declares. */
const describeComponent = (component: MachineComponent): string => {
  switch (component.kind) {
    case 'motion': {
      return `Moves ${component.axes.map((axis) => axis.toUpperCase()).join(', ')}`;
    }
    case 'spindle': {
      const speed = component.speed === undefined ? '' : `, ${component.speed.min}–${component.speed.max} rpm`;
      return `Spindle, ${component.control === 'programmed' ? 'set by the program' : component.control === 'switched' ? 'switched on and off' : 'set by hand'}${speed}`;
    }
    case 'tools': {
      return component.change === 'automatic'
        ? `Automatic changer, ${counted(component.pockets, 'pocket')}`
        : 'Changed by hand';
    }
    case 'probe': {
      return component.finds === 'work' ? 'Probe, finds the work' : 'Probe, measures tool length';
    }
    case 'interlock': {
      return `Interlock, ${component.guards === 'emergency-stop' ? 'emergency stop' : component.guards}`;
    }
    case 'vendor': {
      return `Vendor part ${component.type}`;
    }
    case 'toolhead': {
      return `Toolhead, ${counted(component.nozzles.length, 'nozzle')}`;
    }
    case 'material-system': {
      return `Material system, ${counted(component.units.length, 'unit')}`;
    }
    default: {
      return kindLabels[component.kind];
    }
  }
};

const describeRemedy = (remedy: MachineRemedy): string => {
  switch (remedy.type) {
    case 'person': {
      return remedy.instruction;
    }
    case 'stop': {
      return `Stop (${remedy.consequence})`;
    }
    case 'action': {
      return `${remedy.action} on ${remedy.componentId}`;
    }
  }
};

const whoMayUse = ({ safety }: Pick<MachineActionDescriptor, 'safety'>): string =>
  `${authorityLabels[safety.authority]}${safety.attended ? ', at the machine' : ''}`;

/** Keywords whose values are instances rather than schemas. */
const instanceKeywords = new Set(['const', 'default', 'enum', 'examples']);

/**
 * Give every array schema `maxItems: 0` so the renderer offers no Add.
 *
 * ponytail: the shared theme's array template ignores `readonly`, so an item a
 * schema defaults into an array would still offer Remove (nothing is written).
 * Teach `ArrayFieldTemplate` to honor `readonly` and drop this walk.
 *
 * @param node - A draft-07 schema, walked in place.
 */
const withholdArrayGrowth = (node: unknown): void => {
  if (typeof node !== 'object' || node === null) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (!instanceKeywords.has(key)) {
      withholdArrayGrowth(value);
    }
  }
  if (Reflect.get(node, 'type') === 'array') {
    Reflect.set(node, 'maxItems', 0);
  }
};

/** A form's view: the draft-07 schema the renderer reads and every value the declaration gives. */
type ConfigurationView =
  | Readonly<{ status: 'ready'; manifest: ParameterManifest; schema: RJSFSchema; values: Record<string, unknown> }>
  | Readonly<{ status: 'unavailable'; reason: string }>;

/** Which provider configuration a form shows (`binding` or `submission`), and whether it only shows its values. */
type ConfigurationRequest = Readonly<{
  providerId: string;
  name: string;
  configuration: ConfigurationManifestV1;
  isReadOnly: boolean;
}>;

/**
 * Compile a provider configuration's native declaration into the manifest and
 * view the shared Parameters renderer needs.
 *
 * @param request - The provider, which configuration, its manifest and whether the fields only show values.
 * @returns The view, or why it cannot be shown.
 */
const compileConfigurationView = async ({
  providerId,
  name,
  configuration,
  isReadOnly,
}: ConfigurationRequest): Promise<ConfigurationView> => {
  const projection = configuration.parameters.input;
  if (projection.status !== 'usable') {
    return { status: 'unavailable', reason: projection.diagnostics.map(({ reason }) => reason).join(' ') };
  }
  // SAFETY: `sha256StringSync` returns the 64 lowercase hex digits a content digest carries.
  const digest = `sha256:${sha256StringSync(JSON.stringify(projection.declaration))}` as ParameterManifest['revision'];
  const manifest = await compileParameterManifest({
    declaration: projection.declaration,
    scope: { kind: 'provider', provider: providerId, configuration: name },
    source: { ...configuration.source, revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });
  if (manifest.legacyProjection.status !== 'usable') {
    return {
      status: 'unavailable',
      reason: manifest.legacyProjection.diagnostics.map(({ message }) => message).join(' '),
    };
  }
  const schema: RJSFSchema = structuredClone(manifest.legacyProjection.schema);
  if (isReadOnly) {
    schema.readOnly = true;
    withholdArrayGrowth(schema);
  }
  // Every value the schema declares, optional fields included: the form itself fills only required ones, and a
  // declared default missing from `defaultParameters` would read as unset and changed.
  const values: unknown = getDefaultFormState(rjsfValidator, schema, { ...manifest.defaults }, schema, false, {
    ...rjsfDefaultFormStateBehavior,
    emptyObjectFields: 'populateAllDefaults',
  });
  return { status: 'ready', manifest, schema, values: isRecord(values) ? values : {} };
};

const useConfigurationView = ({
  providerId,
  name,
  configuration,
  isReadOnly,
}: ConfigurationRequest): ConfigurationView | undefined => {
  const [compiled, setCompiled] =
    useState<Readonly<{ configuration: ConfigurationManifestV1; isReadOnly: boolean; view: ConfigurationView }>>();
  useEffect(() => {
    let isCancelled = false;
    const compile = async (): Promise<void> => {
      let view: ConfigurationView;
      try {
        view = await compileConfigurationView({ providerId, name, configuration, isReadOnly });
      } catch (error) {
        view = { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
      }
      if (!isCancelled) {
        setCompiled({ configuration, isReadOnly, view });
      }
    };
    // async-iife: bootstrap -- the view derives from the frozen declaration; a newer declaration supersedes it.
    void compile();
    return () => {
      isCancelled = true;
    };
  }, [configuration, isReadOnly, name, providerId]);
  return compiled?.configuration === configuration && compiled.isReadOnly === isReadOnly ? compiled.view : undefined;
};

function Identifier({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <code className='font-mono text-xs text-muted-foreground'>{children}</code>;
}

/** One declared fact: the label a newcomer reads beside the exact value an engineer checks. */
function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/70 py-1.5 last:border-b-0'>
      <dt className='min-w-0 text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 tabular-nums'>{children}</dd>
    </div>
  );
}

/** One standard part: folded to its summary until asked. */
function Part({
  id,
  title,
  summary,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AccordionItem value={id} className='border-border/70 last:border-b-0'>
      <AccordionTrigger className='gap-3 rounded-md px-3 py-2 font-normal outline-none hover:bg-accent/50 hover:no-underline focus-visible:focus-outline'>
        <span className='shrink-0'>{title}</span>{' '}
        <span className='min-w-0 flex-1 truncate text-right text-xs text-muted-foreground'>{summary}</span>
      </AccordionTrigger>
      <AccordionContent className='px-3 pb-3'>{children}</AccordionContent>
    </AccordionItem>
  );
}

function QualificationMark({ status }: { readonly status: QualificationStatus }): React.JSX.Element {
  const Glyph = qualificationGlyphs[status];
  return (
    <span className='inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <Glyph aria-hidden className={cn('size-3.5 shrink-0', status === 'qualified' && 'text-success')} />
      {qualificationLabels[status]}
    </span>
  );
}

function ActionRow({
  action,
  component,
}: {
  /** An action or a hold; both carry the same declared facts. */
  readonly action: Omit<MachineActionDescriptor, 'scope'>;
  readonly component: string;
}): React.JSX.Element {
  const takes = fieldNames(action.configuration);
  const { qualification } = action;
  const notes = [
    action.description,
    action.effects.map((effect) => effectLabels[effect]).join(', '),
    whoMayUse(action),
    takes.length > 0 ? `Takes ${takes.join(', ')}` : undefined,
    qualification.status === 'qualified' ? `Proven in ${qualification.profileId}` : qualification.reason,
  ].filter((note) => note !== undefined && note !== '');
  return (
    <li className='flex flex-col gap-0.5 border-b border-border/70 py-2 last:border-b-0'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1'>
        <span>{action.label}</span> <QualificationMark status={qualification.status} />
      </div>{' '}
      <p className='text-xs text-muted-foreground'>
        <Identifier>{action.id}</Identifier> on {component}
        {notes.map((note) => ` · ${note}`).join('')}
      </p>
    </li>
  );
}

/** One component's facts: its kind, and the nozzles or material units it declares. */
function ComponentFacts({ component }: { readonly component: MachineComponent }): React.JSX.Element {
  return (
    <>
      <Fact label={component.label}>
        {describeComponent(component)} <Identifier>{component.id}</Identifier>
      </Fact>
      {component.kind === 'toolhead'
        ? component.nozzles.map((nozzle) => (
            <Fact key={nozzle.id} label={`Nozzle ${formatQuantity(nozzle.diameter)}`}>
              {nozzleMaterialLabels[nozzle.material]}, up to {formatQuantity(nozzle.maximumTemperature)}{' '}
              <Identifier>{nozzle.id}</Identifier>
            </Fact>
          ))
        : null}
      {component.kind === 'material-system'
        ? component.units.map((unit) => (
            <Fact key={unit.id} label={unit.label}>
              {unit.kind === 'feeder' ? 'Feeder' : 'External holder'},{' '}
              {listed(
                unit.slots.map(({ label }) => label),
                'no slots',
              )}{' '}
              <Identifier>{unit.id}</Identifier>
            </Fact>
          ))
        : null}
    </>
  );
}

/** The FFF process: the printer's geometry, bed, chamber, speed profiles and slicing defaults. */
function FffProcessFacts({ process }: { readonly process: MachineFffProcess }): React.JSX.Element {
  const { geometry, bed, chamber, speedProfiles, slicing } = process;
  return (
    <dl>
      <Fact label='Build volume'>{formatSize(geometry.buildVolume, geometry.unit)}</Fact>
      <Fact label='Outer size'>{formatSize(geometry.enclosure.outer, geometry.unit)}</Fact>
      <Fact label='Enclosure'>{enclosureLabel(geometry.enclosure.enclosed)}</Fact>
      <Fact label='Doors'>
        {listed(
          geometry.enclosure.doors.map((door) => doorLabels[door]),
          'None',
        )}
      </Fact>
      <Fact label='Kinematics'>{kinematicsLabels[geometry.kinematics]}</Fact>
      <Fact label='Bed motion'>{bedMotionLabels[geometry.bedMotion]}</Fact>
      <Fact label='Origin'>{originLabels[geometry.origin]}</Fact>
      <Fact label='Toolhead home'>
        {`X ${geometry.toolheadHome.x} · Y ${geometry.toolheadHome.y} · Z ${geometry.toolheadHome.z} ${geometry.unit}`}
      </Fact>
      <Fact label='Filament diameter'>{formatQuantity(process.filamentDiameter)}</Fact>
      <Fact label='Bed maximum temperature'>{formatQuantity(bed.maximumTemperature)}</Fact>
      {bed.plates.map((plate) => (
        <Fact key={plate.id} label={plate.label}>
          <Identifier>{plate.id}</Identifier>
        </Fact>
      ))}
      <Fact label='Chamber heated'>
        {chamber.heated && chamber.maximumTemperature
          ? `Yes, up to ${formatQuantity(chamber.maximumTemperature)}`
          : yesNo(chamber.heated)}
      </Fact>
      {speedProfiles.map((profile) => (
        <Fact key={profile.id} label={`${profile.label} speed`}>
          {profile.percent}% <Identifier>{profile.id}</Identifier>
        </Fact>
      ))}
      <Fact label='Layer height'>{formatQuantity(slicing.recommended.layerHeight)}</Fact>
      <Fact label='Walls'>{slicing.recommended.walls}</Fact>
      <Fact label='Infill'>{slicing.recommended.infillPercent}%</Fact>
      <Fact label='Nozzle temperature'>{formatQuantity(slicing.recommended.nozzleTemperature)}</Fact>
      <Fact label='Bed temperature'>{formatQuantity(slicing.recommended.bedTemperature)}</Fact>
      {slicing.presets.map((preset) => (
        <Fact key={preset.id} label={`${preset.label} preset`}>
          {formatQuantity(preset.layerHeight)} layers <Identifier>{preset.id}</Identifier>
        </Fact>
      ))}
    </dl>
  );
}

/** The milling process: interpolation, controller features, work offsets and the work area. */
function MillingProcessFacts({ process }: { readonly process: MachineMillingProcess }): React.JSX.Element {
  return (
    <dl>
      <Fact label='Simultaneous axes'>{process.simultaneousAxes}</Fact>
      <Fact label='Features'>
        {listed(
          process.features.map((feature) => millingFeatureLabels[feature]),
          'None',
        )}
      </Fact>
      <Fact label='Work offsets'>{process.workOffsets.join(', ')}</Fact>
      {process.workArea === undefined ? null : <Fact label='Work area'>{formatSize(process.workArea)}</Fact>}
      {process.kinematics === undefined ? null : (
        <Fact label='Kinematics'>
          <Identifier>{`${process.kinematics.id} ${process.kinematics.calibrationRevision}`}</Identifier>
        </Fact>
      )}
    </dl>
  );
}

/** What was proven on this model, where, and on which firmware. */
function QualificationProfiles({
  qualifications,
}: {
  readonly qualifications: MachineManifest['qualifications'];
}): React.JSX.Element {
  return qualifications.length === 0 ? (
    <p className='text-xs text-muted-foreground'>
      Nothing has been proven on this model yet, so every control is designed or unsupported.
    </p>
  ) : (
    <dl>
      {qualifications.map((profile) => (
        <Fact key={profile.id} label={profile.id}>
          {profile.environment === 'hardware' ? 'Hardware' : 'Simulation'} · {profile.model} · Firmware{' '}
          {listed(profile.firmware, 'any')} · {profile.evidence}
        </Fact>
      ))}
    </dl>
  );
}

const transportLabel = ({ transport }: MachineManifest['connection']): string =>
  transport === 'network' ? 'Network' : 'Serial cable';

const jobsSummary = (jobs: MachineManifest['jobs']): string =>
  jobs.type === 'unsupported'
    ? 'Not supported'
    : `${jobs.delivery === 'stored' ? 'Stored' : 'Streamed'} · ${jobs.start === 'remote' ? 'Started by Tau' : 'Started at the machine'}`;

/** How programs reach the machine and start, and what a person vouches for first. */
function JobFacts({ jobs }: { readonly jobs: MachineManifest['jobs'] }): React.JSX.Element {
  if (jobs.type === 'unsupported') {
    return <p className='text-xs text-muted-foreground'>Tau cannot send programs to this machine.</p>;
  }
  return (
    <dl>
      <Fact label='Delivery'>
        {jobs.delivery === 'stored'
          ? 'Stored on the machine'
          : 'Streamed by this computer, which must stay connected until the run ends'}
      </Fact>
      <Fact label='Start'>
        {jobs.start === 'remote' ? 'Tau starts the run' : 'A person presses start at the machine'}
      </Fact>
      <Fact label='Accepts'>{jobs.accepts.map(({ mediaType }) => mediaType).join(', ')}</Fact>
      <Fact label='Who may start'>{whoMayUse(jobs)}</Fact>
      {jobs.attestations.map((attestation) => (
        <Fact key={attestation.id} label='Vouched before a start'>
          {attestation.label}
        </Fact>
      ))}
    </dl>
  );
}

const processSummary = (manifest: MachineManifest): string => {
  const fff = fffProcessOf(manifest);
  const milling = millingProcessOf(manifest);
  return listed(
    [
      fff === undefined
        ? undefined
        : `FFF ${formatSize(fff.geometry.buildVolume, fff.geometry.unit)} · ${kinematicsLabels[fff.geometry.kinematics]}`,
      milling === undefined ? undefined : `Milling, ${milling.simultaneousAxes}-axis`,
      ...manifest.processes.filter(({ type }) => type !== 'fff' && type !== 'milling').map(({ type }) => type),
    ].filter((part) => part !== undefined),
    'None declared',
    ' · ',
  );
};

/**
 * A provider configuration's declared fields through the shared Parameters renderer. They only show
 * their values unless the flow passes `onChange`, which then receives the fields that differ from
 * the shown defaults.
 *
 * @param properties - The provider and configuration; for a flow that chooses values, the chosen
 * values, the change handler, and `omit`, the fields the flow fills itself and so does not offer.
 * @returns The fields, or why they cannot be shown.
 */
export function ConfigurationFields({
  providerId,
  name,
  configuration,
  values = noValues,
  onChange,
  omit = noFields,
  titles,
  presentation = 'catalog',
}: {
  readonly providerId: string;
  readonly name: string;
  readonly configuration: ConfigurationManifestV1;
  readonly values?: Record<string, unknown>;
  readonly onChange?: (values: Record<string, unknown>) => void;
  readonly omit?: readonly string[];
  readonly titles?: Readonly<Record<string, string>>;
  readonly presentation?: 'catalog' | 'embedded';
}): React.JSX.Element {
  const compiled = useConfigurationView({ providerId, name, configuration, isReadOnly: onChange === undefined });
  const view = useMemo(() => {
    if (compiled?.status !== 'ready' || (omit.length === 0 && titles === undefined)) {
      return compiled;
    }
    const { properties = {}, required = [] } = compiled.schema;
    const offered: typeof properties = {};
    for (const [key, property] of Object.entries(properties)) {
      if (omit.includes(key)) {
        continue;
      }
      offered[key] =
        typeof property === 'object' && titles?.[key] !== undefined ? { ...property, title: titles[key] } : property;
    }
    return {
      ...compiled,
      schema: {
        ...compiled.schema,
        properties: offered,
        required: required.filter((key) => !omit.includes(key)),
      },
    };
  }, [compiled, omit, titles]);
  if (view === undefined) {
    return (
      <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
        Preparing the declared fields…
      </p>
    );
  }
  if (view.status === 'unavailable') {
    return <p className='text-xs text-muted-foreground'>These fields cannot be shown: {view.reason}</p>;
  }
  return (
    <Parameters
      parameters={values}
      defaultParameters={view.values}
      jsonSchema={view.schema}
      enableSearch={false}
      presentation={presentation}
      units={configurationUnits}
      parameterManifest={view.manifest}
      parameterEdit={transientEdit}
      emptyMessage='No declared fields'
      emptyDescription='This provider declares no fields here.'
      onParametersChange={onChange ?? keepDeclaredValues}
    />
  );
}

/**
 * Every part of one bound machine, from its provider's manifest.
 *
 * @param properties - The provider that owns the manifest, the machine's logical id and the firmware it reports.
 * @returns The folded parts list.
 */
export const MachineDetails = memo(function MachineDetails({
  provider,
  machineId,
  firmware,
}: {
  readonly provider: MachineProvider;
  readonly machineId: string;
  readonly firmware: string;
}): React.JSX.Element {
  const { manifest } = provider;
  const { identity, connection, axes, components, actions, holds, jobs, stop, observations, qualifications } = manifest;
  const fff = fffProcessOf(manifest);
  const milling = millingProcessOf(manifest);
  const controls = [...actions, ...holds];
  const covering = qualifications.find((profile) => profile.firmware.includes(firmware));
  const FirmwareGlyph = covering === undefined ? ShieldQuestion : ShieldCheck;
  const budgets = observations.map(({ staleAfter }) => staleAfter);
  const componentLabels = new Map(components.map(({ id, label }) => [id, label]));
  const controlSummary = qualificationOrder
    .map((status) => [status, controls.filter(({ qualification }) => qualification.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(' · ');
  return (
    <Accordion type='multiple' className='text-sm'>
      <Part id='identity' title='Identity and firmware' summary={`Firmware ${firmware}`}>
        <dl>
          <Fact label='Model'>
            {identity.vendor} {identity.displayName}
          </Fact>
          {identity.family === undefined ? null : <Fact label='Family'>{identity.family}</Fact>}
          <Fact label='Model id'>
            <Identifier>{identity.model}</Identifier>
          </Fact>
          {isSimulatedMachine(manifest) ? <Fact label='Hardware'>Simulated, no machine attached</Fact> : null}
          <Fact label='Firmware'>
            {firmware}{' '}
            <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
              <FirmwareGlyph aria-hidden className={cn('size-3.5 shrink-0', covering && 'text-success')} />
              {covering === undefined ? 'Not in a qualification profile' : `Qualified in ${covering.id}`}
            </span>
          </Fact>
          <Fact label='Provider'>
            {provider.name} <Identifier>{`${provider.id} ${provider.version}`}</Identifier>
          </Fact>
          <Fact label='Machine id'>
            <Identifier>{machineId}</Identifier>
          </Fact>
        </dl>
      </Part>
      <Part
        id='qualifications'
        title='Qualification profiles'
        summary={qualifications.length === 0 ? 'None yet' : counted(qualifications.length, 'profile')}
      >
        <QualificationProfiles qualifications={qualifications} />
      </Part>
      <Part
        id='connection'
        title='Connection'
        summary={`${transportLabel(connection)} · ${connection.identity === 'authenticated' ? 'Authenticated' : 'Claimed identity'}`}
      >
        <dl>
          <Fact label='Transport'>{transportLabel(connection)}</Fact>
          <Fact label='One host at a time'>{yesNo(connection.exclusive)}</Fact>
          <Fact label='Connecting'>
            {connection.opening === 'resets-controller' ? 'Restarts the controller' : 'Changes nothing'}
          </Fact>
          <Fact label='Identity'>
            {connection.identity === 'authenticated' ? 'Authenticated' : 'Claimed by the machine, not verified'}
          </Fact>
        </dl>
      </Part>
      <Part
        id='axes'
        title='Axes'
        summary={listed(
          axes.map(({ label }) => label),
          'None declared',
        )}
      >
        <dl>
          {axes.map((axis) => (
            <Fact key={axis.id} label={axis.label}>
              {axisSummary(axis)} <Identifier>{axis.id}</Identifier>
            </Fact>
          ))}
        </dl>
      </Part>
      <Part id='components' title='Components' summary={counted(components.length, 'component')}>
        <dl>
          {components.map((component) => (
            <ComponentFacts key={component.id} component={component} />
          ))}
        </dl>
      </Part>
      <Part id='processes' title='Processes' summary={processSummary(manifest)}>
        {fff === undefined ? null : <FffProcessFacts process={fff} />}
        {milling === undefined ? null : <MillingProcessFacts process={milling} />}
        {fff === undefined && milling === undefined ? (
          <p className='text-xs text-muted-foreground'>This machine declares no process Tau knows.</p>
        ) : null}
      </Part>
      <Part id='jobs' title='Jobs' summary={jobsSummary(jobs)}>
        <JobFacts jobs={jobs} />
      </Part>
      <Part id='stop' title='Stop' summary={describeOutcome(stop)}>
        <dl>
          <Fact label='What Stop does'>{describeOutcome(stop)}</Fact>
          <Fact label='Recovery'>{listed(stop.recovery.map(describeRemedy), 'None needed', ', then ')}</Fact>
        </dl>
        <p className='pt-1 text-xs text-muted-foreground'>
          Stop is sent over the connection; it is not a safety-rated emergency stop.
        </p>
      </Part>
      <Part id='actions' title='Controls' summary={controls.length === 0 ? 'None declared' : controlSummary}>
        {controls.length === 0 ? (
          <p className='text-xs text-muted-foreground'>This machine declares no controls.</p>
        ) : (
          <>
            <p className='text-xs text-muted-foreground'>
              Only qualified controls are offered. Designed controls can be tried by a person while Testing is on;
              unsupported ones stay off for the reason shown.
            </p>
            <ul aria-label='Controls'>
              {controls.map((action) => (
                <ActionRow
                  key={`${action.componentId}:${action.id}`}
                  action={action}
                  component={componentLabels.get(action.componentId) ?? action.componentId}
                />
              ))}
            </ul>
          </>
        )}
      </Part>
      <Part
        id='observations'
        title='Observation freshness'
        summary={
          observations.length === 0
            ? 'None declared'
            : `${counted(observations.length, 'group')} · ${formatStaleAfter(Math.min(...budgets))} to ${formatStaleAfter(Math.max(...budgets))}`
        }
      >
        {observations.length === 0 ? (
          <p className='text-xs text-muted-foreground'>This machine declares no observation groups.</p>
        ) : (
          <>
            <p className='text-xs text-muted-foreground'>A reading older than its budget is shown as stale.</p>
            <dl>
              {observations.map((observation) => (
                <Fact key={observation.group} label={observation.label}>
                  Stale after {formatStaleAfter(observation.staleAfter)}
                </Fact>
              ))}
            </dl>
          </>
        )}
      </Part>
      <Part
        id='binding'
        title='Binding settings'
        summary={`${counted(countFields(provider.bindingConfiguration), 'field')} · Read-only`}
      >
        <div className='flex flex-col gap-2'>
          <p className='text-xs text-muted-foreground'>
            {isSimulatedMachine(manifest) ? 'Only the simulator reads these; they are not machine settings. ' : ''}
            Chosen when this machine was bound; the host reports neither the chosen values nor a way to change them, so
            these are the declared fields. Declared by{' '}
            <Identifier>{`${provider.bindingConfiguration.source.id} ${provider.bindingConfiguration.source.version}`}</Identifier>
            .
          </p>
          <ConfigurationFields providerId={provider.id} name='binding' configuration={provider.bindingConfiguration} />
        </div>
      </Part>
      {jobs.type === 'unsupported' ? null : (
        <Part
          id='submission'
          title='Job options'
          summary={`${counted(countFields(jobs.submission), 'field')} · Set per job`}
        >
          <div className='flex flex-col gap-2'>
            <p className='text-xs text-muted-foreground'>
              Each job chooses these in the Print pane; shown here with their declared defaults. Declared by{' '}
              <Identifier>{`${jobs.submission.source.id} ${jobs.submission.source.version}`}</Identifier>.
            </p>
            <ConfigurationFields providerId={provider.id} name='submission' configuration={jobs.submission} />
          </div>
        </Part>
      )}
    </Accordion>
  );
});
