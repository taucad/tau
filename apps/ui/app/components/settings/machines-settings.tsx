/**
 * Machines settings card (D10).
 *
 * The host serving this project's machines facet owns every machine: the
 * card discovers through it, begins a binding through it, and completes the
 * ceremony through the desktop shell so the access code goes to the utility's
 * protected store and never into page state. The simulated X1C binds without
 * an address or a code; it is the dry-run device.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSelector } from '@xstate/react';
import type { MachineBindingOutcome, MachineClient } from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
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
  const configuration = {
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

function MachinesPanel({ client }: { readonly client: MachineClient }): React.JSX.Element {
  const directory = useMachineDirectory(client);
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const entries = directory.snapshot?.entries ?? [];
  const offers = (providerId: string): boolean => directory.providers.some((provider) => provider.id === providerId);

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
            <li
              key={entry.machineId}
              className='flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-2 text-sm'
            >
              <span className='font-medium'>{entry.descriptor.name}</span>
              <span className='text-xs text-muted-foreground'>
                {entry.descriptor.vendor} {entry.descriptor.model}
                {entry.providerId === simulatorProviderId ? ' · Simulated' : ''}
                {entry.freshness === 'stale' ? ' · Stale' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {directory.error === undefined ? undefined : (
        <p role='alert' className='text-xs text-destructive'>
          {directory.error}
        </p>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || !offers(simulatorProviderId)}
          onClick={async () => run('Simulated X1C', { providerId: simulatorProviderId, name: simulatorName })}
        >
          Add simulated X1C
        </Button>
      </div>
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
          <Button type='submit' size='sm' disabled={busy || !offers(bambuProviderId)}>
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
