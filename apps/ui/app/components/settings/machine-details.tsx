/**
 * Machine details for Settings › Compute › Machines, drawn from the provider's
 * manifest alone (blueprint D7, R3).
 *
 * Every standard part is a folded row whose one-line summary orients a
 * newcomer; opening it shows the exact declared values an engineer inspects.
 * The binding and print-submission configurations render through the shared
 * Parameters renderer from their native JSON Structure declarations, read-only:
 * the host offers no change to a binding once it exists, and each print chooses
 * its own submission values in the Print pane. Nothing here names a vendor or a
 * model, so a second provider's manifest renders the same way.
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
import type { MachineActionDescriptor, MachineManifest, MachineProvider } from '@taucad/runtime/machine';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@taucad/ui/components/accordion';
import { cn } from '@taucad/ui/utils/cn';
import { sha256StringSync } from '@taucad/utils/hash';
import { isRecord } from '@taucad/utils/schema';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { ParameterEdit, Units } from '#components/geometry/parameters/rjsf-context.js';
import { rjsfDefaultFormStateBehavior } from '#components/geometry/parameters/rjsf-utils.js';
import { rjsfValidator } from '#lib/rjsf-validator.js';
import { formatQuantity } from '#routes/w.$workspace.$project/chat-print-summary.js';

type Geometry = MachineManifest['geometry'];
type Qualification = MachineActionDescriptor['qualification'];

const technologyLabels: Readonly<Record<MachineManifest['technology'], string>> = {
  'additive.fff': 'Fused filament fabrication',
};
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
const mountLabels: Readonly<Record<Geometry['materialSystemMount'], string>> = {
  top: 'On top',
  side: 'On the side',
  external: 'External',
  none: 'None',
};
const nozzleMaterialLabels: Readonly<Record<MachineManifest['toolhead']['nozzles'][number]['material'], string>> = {
  hardened: 'Hardened steel',
  stainless: 'Stainless steel',
};
const effectLabels: Readonly<Record<MachineActionDescriptor['effect'], string>> = {
  none: 'No physical effect',
  observe: 'Observation',
  thermal: 'Thermal effect',
  motion: 'Motion effect',
  material: 'Material effect',
  print: 'Print effect',
  storage: 'Storage effect',
};
const qualificationLabels: Readonly<Record<Qualification, string>> = {
  qualified: 'Qualified',
  designed: 'Designed, not yet qualified',
  unsupported: 'Unsupported',
};
const qualificationGlyphs: Readonly<Record<Qualification, LucideIcon>> = {
  qualified: ShieldCheck,
  designed: Wrench,
  unsupported: Ban,
};
const qualificationOrder: readonly Qualification[] = ['qualified', 'designed', 'unsupported'];

/** Machines settings show native millimetres, as the manifests declare them. */
const configurationUnits: Units = { length: { displaySymbol: 'mm' } };
const transientEdit: ParameterEdit = { kind: 'transient' };
const noValues: Record<string, unknown> = {};
const noFields: readonly string[] = [];
/** A read-only form keeps nothing: the host offers no update for a configuration it shows. */
const keepDeclaredValues = (): void => undefined;

/**
 * Whether a provider is a labeled simulator rather than hardware (blueprint D10).
 *
 * ponytail: the provider contract has no simulated flag; the `<vendor>-simulator`
 * id convention is what the Print pane reads too. Add a manifest flag when a
 * second simulator needs a different id.
 *
 * @param providerId - The provider id.
 * @returns True for a simulator.
 */
export const isSimulatedProvider = (providerId: string): boolean => providerId.includes('simulator');

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No');
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
const formatSize = ({ x, y, z }: Geometry['buildVolume'], unit: string): string => `${x} × ${y} × ${z} ${unit}`;
const enclosureLabel = (enclosed: boolean): string => (enclosed ? 'Enclosed' : 'Open frame');
const listed = (items: readonly string[], none: string, separator = ', '): string =>
  items.length > 0 ? items.join(separator) : none;

const chamberSummary = ({ enclosed, heated, fans }: MachineManifest['chamber']): string =>
  `${enclosed ? 'Enclosed' : 'Open'} · ${heated ? 'Heated' : 'Not heated'} · ${counted(fans.length, 'fan')}`;

const heatedLabel = ({ heated, maximumTemperature }: MachineManifest['chamber']): string =>
  heated && maximumTemperature ? `Yes, up to ${formatQuantity(maximumTemperature)}` : yesNo(heated);

const materialSummary = ({ units, slotsPerUnit, externalSpool }: MachineManifest['materialSystem']): string => {
  const slots = units === 0 ? 'None' : `${counted(units, 'unit')} × ${counted(slotsPerUnit, 'slot')}`;
  return externalSpool ? `${slots} · External spool` : slots;
};

const cameraSummary = ({ stills }: MachineManifest['camera']): string => (stills ? 'Stills' : 'None');

/**
 * An observation budget in the unit people read it in: "15 s", "2 min".
 *
 * @param staleAfter - Milliseconds.
 * @returns The budget.
 */
const formatStaleAfter = (staleAfter: number): string =>
  staleAfter < 60_000 ? `${staleAfter / 1000} s` : `${staleAfter / 60_000} min`;

const countFields = (configuration: ConfigurationManifestV1): number => {
  const projection = configuration.parameters.input;
  const properties = projection.status === 'usable' ? projection.declaration.schema['properties'] : undefined;
  return typeof properties === 'object' && properties !== null ? Object.keys(properties).length : 0;
};

const parameterNames = (action: MachineActionDescriptor): readonly string[] => {
  const properties = action.parameters?.['properties'];
  return typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
};

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

function QualificationMark({ level }: { readonly level: Qualification }): React.JSX.Element {
  const Glyph = qualificationGlyphs[level];
  return (
    <span className='inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <Glyph aria-hidden className={cn('size-3.5 shrink-0', level === 'qualified' && 'text-success')} />
      {qualificationLabels[level]}
    </span>
  );
}

function ActionRow({ action }: { readonly action: MachineActionDescriptor }): React.JSX.Element {
  const takes = parameterNames(action);
  const notes = [
    action.description,
    action.preconditions === undefined || action.preconditions.length === 0
      ? undefined
      : `Needs ${action.preconditions.join(', ')}`,
    takes.length > 0 ? `Takes ${takes.join(', ')}` : undefined,
  ].filter((note) => note !== undefined);
  return (
    <li className='flex flex-col gap-0.5 border-b border-border/70 py-2 last:border-b-0'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1'>
        <span>{action.label}</span> <QualificationMark level={action.qualification} />
      </div>{' '}
      <p className='text-xs text-muted-foreground'>
        <Identifier>{action.id}</Identifier> · {effectLabels[action.effect]}
        {notes.map((note) => ` · ${note}`).join('')}
      </p>
    </li>
  );
}

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
 * Every standard part of one bound machine, from its provider's manifest.
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
  const { identity, geometry, toolhead, bed, chamber, materialSystem, camera, network } = manifest;
  const { speedProfiles, slicing, actions, observations } = manifest;
  const isQualifiedFirmware = identity.qualifiedFirmware.includes(firmware);
  const FirmwareGlyph = isQualifiedFirmware ? ShieldCheck : ShieldQuestion;
  const percents = speedProfiles.map(({ percent }) => percent);
  const budgets = observations.map(({ staleAfter }) => staleAfter);
  const networkModes = [network.lanMode ? 'LAN mode' : undefined, network.cloud ? 'Vendor cloud' : undefined].filter(
    (mode) => mode !== undefined,
  );
  const actionSummary = qualificationOrder
    .map((level) => [level, actions.filter(({ qualification }) => qualification === level).length] as const)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`)
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
          {isSimulatedProvider(provider.id) ? <Fact label='Hardware'>Simulated, no printer attached</Fact> : null}
          <Fact label='Technology'>{technologyLabels[manifest.technology]}</Fact>
          <Fact label='Firmware'>
            {firmware}{' '}
            <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
              <FirmwareGlyph aria-hidden className={cn('size-3.5 shrink-0', isQualifiedFirmware && 'text-success')} />
              {isQualifiedFirmware ? 'Qualified' : 'Not in the qualified list'}
            </span>
          </Fact>
          <Fact label='Qualified firmware'>{listed(identity.qualifiedFirmware, 'None yet')}</Fact>
          <Fact label='Provider'>
            {provider.name} <Identifier>{`${provider.id} ${provider.version}`}</Identifier>
          </Fact>
          <Fact label='Machine id'>
            <Identifier>{machineId}</Identifier>
          </Fact>
          <Fact label='Accepts'>{provider.accepts.map(({ mediaType }) => mediaType).join(', ')}</Fact>
        </dl>
      </Part>
      <Part
        id='geometry'
        title='Geometry'
        summary={`${formatSize(geometry.buildVolume, geometry.unit)} · ${kinematicsLabels[geometry.kinematics]} · ${enclosureLabel(geometry.enclosure.enclosed)}`}
      >
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
        </dl>
      </Part>
      <Part
        id='toolhead'
        title='Toolhead and nozzles'
        summary={`${toolhead.nozzles.map(({ diameter }) => formatQuantity(diameter)).join(', ')} ${toolhead.nozzles.length === 1 ? 'nozzle' : 'nozzles'} · ${formatQuantity(toolhead.filamentDiameter)} filament`}
      >
        <dl>
          <Fact label='Filament diameter'>{formatQuantity(toolhead.filamentDiameter)}</Fact>
          {toolhead.nozzles.map((nozzle) => (
            <Fact key={nozzle.id} label={`Nozzle ${formatQuantity(nozzle.diameter)}`}>
              {nozzleMaterialLabels[nozzle.material]}, up to {formatQuantity(nozzle.maximumTemperature)}{' '}
              <Identifier>{nozzle.id}</Identifier>
            </Fact>
          ))}
        </dl>
      </Part>
      <Part
        id='bed'
        title='Bed and plates'
        summary={`${counted(bed.plates.length, 'plate')} · up to ${formatQuantity(bed.maximumTemperature)}`}
      >
        <dl>
          <Fact label='Maximum temperature'>{formatQuantity(bed.maximumTemperature)}</Fact>
          {bed.plates.map((plate) => (
            <Fact key={plate.id} label={plate.label}>
              <Identifier>{plate.id}</Identifier>
            </Fact>
          ))}
        </dl>
      </Part>
      <Part id='chamber' title='Chamber and fans' summary={chamberSummary(chamber)}>
        <dl>
          <Fact label='Enclosed'>{yesNo(chamber.enclosed)}</Fact>
          <Fact label='Heated'>{heatedLabel(chamber)}</Fact>
          <Fact label='Light'>{yesNo(chamber.light)}</Fact>
          {chamber.fans.length > 0 ? (
            chamber.fans.map((fan) => (
              <Fact key={fan.id} label={fan.label}>
                <Identifier>{fan.id}</Identifier>
              </Fact>
            ))
          ) : (
            <Fact label='Fans'>None</Fact>
          )}
        </dl>
      </Part>
      <Part id='material' title='Material system' summary={materialSummary(materialSystem)}>
        <dl>
          <Fact label='Units'>{materialSystem.units}</Fact>
          <Fact label='Slots per unit'>{materialSystem.slotsPerUnit}</Fact>
          <Fact label='External spool'>{yesNo(materialSystem.externalSpool)}</Fact>
          <Fact label='Drying'>{materialSystem.drying ? 'Supported' : 'Not supported'}</Fact>
          <Fact label='Mount'>{mountLabels[geometry.materialSystemMount]}</Fact>
        </dl>
      </Part>
      <Part id='camera' title='Camera' summary={cameraSummary(camera)}>
        <dl>
          <Fact label='Still capture'>{yesNo(camera.stills)}</Fact>
        </dl>
      </Part>
      <Part id='storage' title='Storage' summary={manifest.storage.removable ? 'Removable' : 'None'}>
        <dl>
          <Fact label='Removable storage'>{yesNo(manifest.storage.removable)}</Fact>
        </dl>
      </Part>
      <Part id='network' title='Network' summary={listed(networkModes, 'None', ' · ')}>
        <dl>
          <Fact label='Local network (LAN mode)'>{yesNo(network.lanMode)}</Fact>
          <Fact label='Vendor cloud'>{network.cloud ? 'Used' : 'Not used'}</Fact>
        </dl>
      </Part>
      <Part
        id='speed'
        title='Speed profiles'
        summary={
          speedProfiles.length === 0
            ? 'None declared'
            : `${counted(speedProfiles.length, 'profile')} · ${Math.min(...percents)}–${Math.max(...percents)}%`
        }
      >
        {speedProfiles.length === 0 ? (
          <p className='text-xs text-muted-foreground'>This machine declares no speed profiles.</p>
        ) : (
          <dl>
            {speedProfiles.map((profile) => (
              <Fact key={profile.id} label={profile.label}>
                {profile.percent}% <Identifier>{profile.id}</Identifier>
              </Fact>
            ))}
          </dl>
        )}
      </Part>
      <Part
        id='slicing'
        title='Slicing profile'
        summary={`${formatQuantity(slicing.recommended.layerHeight)} layers · ${slicing.presets.map(({ label }) => label).join(', ')}`}
      >
        <dl>
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
      </Part>
      <Part id='actions' title='Actions' summary={actions.length === 0 ? 'None declared' : actionSummary}>
        {actions.length === 0 ? (
          <p className='text-xs text-muted-foreground'>This machine declares no actions.</p>
        ) : (
          <>
            <p className='text-xs text-muted-foreground'>
              Only qualified actions are offered; the rest stay disabled for the reason shown.
            </p>
            <ul aria-label='Actions'>
              {actions.map((action) => (
                <ActionRow key={action.id} action={action} />
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
            {isSimulatedProvider(provider.id) ? 'Only the simulator reads these; they are not printer settings. ' : ''}
            Chosen when this machine was bound; the host reports neither the chosen values nor a way to change them, so
            these are the declared fields. Declared by{' '}
            <Identifier>{`${provider.bindingConfiguration.source.id} ${provider.bindingConfiguration.source.version}`}</Identifier>
            .
          </p>
          <ConfigurationFields providerId={provider.id} name='binding' configuration={provider.bindingConfiguration} />
        </div>
      </Part>
      <Part
        id='submission'
        title='Print options'
        summary={`${counted(countFields(provider.submissionConfiguration), 'field')} · Set per print`}
      >
        <div className='flex flex-col gap-2'>
          <p className='text-xs text-muted-foreground'>
            Each print chooses these in the Print pane; shown here with their declared defaults. Declared by{' '}
            <Identifier>{`${provider.submissionConfiguration.source.id} ${provider.submissionConfiguration.source.version}`}</Identifier>
            .
          </p>
          <ConfigurationFields
            providerId={provider.id}
            name='submission'
            configuration={provider.submissionConfiguration}
          />
        </div>
      </Part>
    </Accordion>
  );
});
