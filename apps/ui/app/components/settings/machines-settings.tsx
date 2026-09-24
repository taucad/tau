/**
 * Machines settings card (D10).
 *
 * The host serving this project's machines facet owns every machine: the
 * card discovers through it, begins a binding through it, and completes the
 * ceremony through the desktop shell so the access code goes to the utility's
 * protected store and never into page state. The simulated X1C binds without
 * an address or a code; it is the dry-run device, and its demo settings come
 * from its own binding declaration. Each bound machine opens to its provider's
 * manifest (`MachineDetails`); the row itself stays one line.
 */

import { memo, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSelector } from '@xstate/react';
import { ChevronDown } from 'lucide-react';
import type {
  MachineBindingOutcome,
  MachineClient,
  MachineDirectoryEntry,
  MachineDiscoverInput,
  MachineProvider,
} from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { ConfigurationFields, MachineDetails, isSimulatedProvider } from '#components/settings/machine-details.js';
import type { ConfigurationFieldsView } from '#components/settings/machine-details.js';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { useMachineDirectory } from '#hooks/use-machines.js';
import { useProject } from '#hooks/use-project.js';

const simulatorProviderId = 'bambu-simulator';
const bambuProviderId = 'bambu';
const simulatorName = 'simulated-x1c';

type BindInput = {
  readonly providerId: string;
  readonly name: string;
  readonly address?: string;
  readonly serial?: string;
  readonly accessCode?: string;
  /** Binding fields chosen through the provider's own declaration. */
  readonly fields?: Readonly<Record<string, unknown>>;
};

/**
 * How the add flow shows the simulator's binding fields: the host names the machine itself, and
 * the demo speed says it is one and starts at real time.
 *
 * ponytail: keyed to `bambu.simulator.binding` 1.1.0, which declares `speed` with no title or
 * default. Once the provider declares both, only the `logicalId` omission is needed here.
 *
 * @param view - The declared fields.
 * @returns The fields as the add flow shows them.
 */
const presentSimulatorBinding = ({ schema, values }: ConfigurationFieldsView): ConfigurationFieldsView => {
  const properties = Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => key !== 'logicalId'));
  const { speed } = properties;
  const required = schema.required?.filter((key) => key !== 'logicalId');
  if (typeof speed !== 'object') {
    return { schema: { ...schema, properties, required }, values };
  }
  return {
    schema: { ...schema, properties: { ...properties, speed: { title: 'Demo speed', ...speed } }, required },
    values: { speed: 1, ...values },
  };
};

/**
 * Bind one machine end to end: discover it, begin the host-local ceremony and,
 * when the host asks for the operator's half, complete it through the shell.
 *
 * ponytail: the first candidate the provider reports is taken; a picker over
 * several LAN candidates belongs here when discovery is broadcast rather than
 * addressed.
 *
 * @param client - The project's machines facet.
 * @param input - What the person typed.
 * @returns The host's own outcome.
 */
const bind = async (client: MachineClient, input: BindInput): Promise<MachineBindingOutcome> => {
  // SAFETY: the Parameters form writes JSON values only, and the host validates the whole configuration
  // against the provider's binding schema before discovery.
  const fields = (input.fields ?? {}) as Readonly<Record<string, MachineDiscoverInput['configuration']>>;
  const configuration = {
    ...fields,
    logicalId: input.name,
    ...(input.address ? { address: input.address } : {}),
    ...(input.serial ? { serial: input.serial } : {}),
  };
  const abort = new AbortController();
  let candidate;
  try {
    for await (const frame of client.discover({ providerId: input.providerId, configuration, signal: abort.signal })) {
      if (frame.type === 'found' || frame.type === 'updated') {
        candidate = frame.candidate;
        break;
      }
    }
  } finally {
    abort.abort();
  }
  if (candidate === undefined) {
    throw new Error('No machine answered. Check the address and that the printer is in LAN mode.');
  }
  const outcome = await client.beginBinding({ candidate, name: input.name });
  if (outcome.status === 'bound') {
    return outcome;
  }
  const bridge = desktopBridge();
  if (bridge === undefined) {
    throw new Error('This runtime cannot complete the binding ceremony; use the Tau desktop app.');
  }
  return bridge.machines.completeBinding({
    ceremonyId: outcome.ceremonyId,
    ...(input.address ? { address: input.address } : {}),
    ...(input.accessCode ? { accessCode: input.accessCode } : {}),
  });
};

const describeOutcome = (name: string, outcome: MachineBindingOutcome): string =>
  outcome.status === 'bound'
    ? `${name} is bound as ${outcome.machineId}.`
    : `${name} is waiting on the printer (ceremony ${outcome.ceremonyId}).`;

/**
 * One bound machine: its name and model at rest, every part of its manifest on request.
 * The details start folded so the list stays a one-line-per-machine summary.
 */
const BoundMachine = memo(function BoundMachine({
  entry,
  provider,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
}): React.JSX.Element {
  return (
    <li className='rounded-md border text-sm'>
      <Collapsible>
        <CollapsibleTrigger className='group/machine flex w-full flex-wrap items-baseline gap-x-2 rounded-md px-3 py-2 text-left hover:bg-accent/50'>
          <span className='font-medium'>{entry.descriptor.name}</span>{' '}
          <span className='text-xs text-muted-foreground'>
            {entry.descriptor.vendor} {entry.descriptor.model}
            {isSimulatedProvider(entry.providerId) ? ' · Simulated' : ''}
            {entry.freshness === 'stale' ? ' · Stale' : ''}
          </span>
          <ChevronDown
            aria-hidden
            className='ml-auto size-4 shrink-0 self-center text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/machine:rotate-180 motion-reduce:transition-none'
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='border-t'>
          {provider ? (
            <MachineDetails provider={provider} machineId={entry.machineId} firmware={entry.descriptor.firmware} />
          ) : (
            <p className='px-3 py-2 text-xs text-muted-foreground'>
              This host no longer offers the {entry.providerId} provider, so its manifest cannot be shown.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
});

function MachinesPanel({ client }: { readonly client: MachineClient }): React.JSX.Element {
  const directory = useMachineDirectory(client);
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [simulatorFields, setSimulatorFields] = useState<Record<string, unknown>>({});
  const entries = directory.snapshot?.entries ?? [];
  const providers = useMemo(
    () => new Map(directory.providers.map((provider) => [provider.id, provider])),
    [directory.providers],
  );
  const simulator = providers.get(simulatorProviderId);

  const run = async (name: string, input: BindInput): Promise<void> => {
    setBusy(true);
    try {
      setStatus(describeOutcome(name, await bind(client, input)));
      directory.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onBindSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (key: string): string => {
      const value = data.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const input = {
      providerId: bambuProviderId,
      name: field('name'),
      address: field('address'),
      serial: field('serial'),
    };
    const accessCodeValue = data.get('accessCode');
    const accessCode = typeof accessCodeValue === 'string' ? accessCodeValue : '';
    /* The code leaves the document before the ceremony runs; it is never state. */
    form.reset();
    await run(input.name, { ...input, accessCode });
  };

  return (
    <>
      {entries.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No machines are bound to this project yet.</p>
      ) : (
        <ul aria-label='Bound machines' className='flex flex-col gap-2'>
          {entries.map((entry) => (
            <BoundMachine key={entry.machineId} entry={entry} provider={providers.get(entry.providerId)} />
          ))}
        </ul>
      )}
      {directory.error === undefined ? undefined : (
        <p role='alert' className='text-xs text-destructive'>
          {directory.error}
        </p>
      )}
      <section aria-labelledby='machines-simulator-title' className='flex flex-col gap-2 border-t pt-4'>
        <h3 id='machines-simulator-title' className='text-sm font-medium'>
          Simulated X1C
        </h3>
        <p className='text-xs text-muted-foreground'>
          A dry-run printer with no hardware, address or code. Its settings only change the simulation; they are not
          printer settings.
        </p>
        {simulator === undefined ? null : (
          <ConfigurationFields
            providerId={simulator.id}
            name='binding'
            configuration={simulator.bindingConfiguration}
            values={simulatorFields}
            present={presentSimulatorBinding}
            onChange={setSimulatorFields}
          />
        )}
        <div>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || simulator === undefined}
            onClick={async () =>
              run('Simulated X1C', { providerId: simulatorProviderId, name: simulatorName, fields: simulatorFields })
            }
          >
            Add simulated X1C
          </Button>
        </div>
      </section>
      <form
        className='grid gap-3 border-t pt-4 lg:grid-cols-2'
        aria-labelledby='machines-bind-title'
        onSubmit={onBindSubmit}
      >
        <h3 id='machines-bind-title' className='text-sm font-medium lg:col-span-2'>
          Bind a Bambu Lab X1C
        </h3>
        <div className='grid gap-1.5'>
          <Label htmlFor='machines-bind-name'>Name</Label>
          <Input id='machines-bind-name' name='name' required maxLength={64} autoComplete='off' />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='machines-bind-address'>Address</Label>
          <Input id='machines-bind-address' name='address' required maxLength={253} autoComplete='off' />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='machines-bind-serial'>Serial (optional)</Label>
          <Input id='machines-bind-serial' name='serial' maxLength={64} autoComplete='off' />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='machines-bind-access-code'>Access code</Label>
          <Input
            id='machines-bind-access-code'
            name='accessCode'
            type='password'
            required
            maxLength={64}
            autoComplete='off'
          />
        </div>
        <div className='lg:col-span-2'>
          <Button type='submit' size='sm' disabled={busy || !providers.has(bambuProviderId)}>
            Bind
          </Button>
        </div>
      </form>
      <p role='status' aria-live='polite' className='text-xs text-muted-foreground'>
        {status}
      </p>
      <p className='text-xs text-muted-foreground'>Removing a machine is not available yet.</p>
    </>
  );
}

export function MachinesSettings(): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const facet = useSelector(
    project?.geometryUnits.get(project.mainEntryPath),
    (state) => state?.context.kernelClient?.machines,
  );
  return (
    <SettingsSectionCard aria-labelledby='machines-title'>
      <CardHeader>
        <CardTitle id='machines-title'>Machines</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {project === undefined ? (
          <p className='text-sm text-muted-foreground'>Open a project to manage the machines it prints to.</p>
        ) : facet?.available ? (
          <MachinesPanel client={facet} />
        ) : (
          <p className='text-sm text-muted-foreground'>
            Machines are unavailable in this runtime{facet ? ` (${facet.reason})` : ''}.
          </p>
        )}
      </CardContent>
    </SettingsSectionCard>
  );
}
