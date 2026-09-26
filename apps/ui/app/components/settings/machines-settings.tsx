/**
 * Machines settings card (D10).
 *
 * Printers belong to this computer, not a project: the host behind any open
 * project's machines facet owns every binding, so a printer set up here is
 * available in every project. The card discovers through that facet, begins a
 * binding through it, and completes the ceremony through the desktop shell, so
 * a typed access code goes to the host, which keeps it in the OS keychain, and
 * never into page state. A printer whose code is already saved binds without
 * one. The simulated X1C binds without an address or a code; it is the dry-run
 * device, and its demo settings come from its own binding declaration. Each
 * bound machine opens to its provider's manifest (`MachineDetails`); the row
 * itself stays one line, with its Remove action beside it.
 */

import { memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useSelector } from '@xstate/react';
import { ChevronDown, CircleAlert, LoaderCircle, Trash2 } from 'lucide-react';
import type {
  MachineBindingOutcome,
  MachineCandidate,
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
import { PasswordInput } from '@taucad/ui/components/password-input';
import { ConfigurationFields, MachineDetails, isSimulatedProvider } from '#components/settings/machine-details.js';
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
  /** The code the person typed, `''` when they left it empty; absent for a binding that needs none (the simulator). */
  readonly accessCode?: string;
  /** Binding fields chosen through the provider's own declaration. */
  readonly fields?: Readonly<Record<string, unknown>>;
};

/** The bind flow names the machine itself, so its binding form does not offer the logical id. */
const flowFilledFields: readonly string[] = ['logicalId'];

/**
 * What a person reads for the host's binding and removal refusals, by code; `undefined` means say nothing.
 * The machine channel carries the code as the message and the desktop shell's invoke wraps it in its own,
 * so the code is looked for anywhere in the message.
 */
const refusals: ReadonlyMap<string, string | undefined> = new Map([
  ['MACHINE_CREDENTIAL_REQUIRED', 'Enter the access code shown on the printer.'],
  [
    'MACHINE_CREDENTIAL_TRUST_CHANGED',
    "The printer's certificate changed since the code was saved. Enter the access code to bind it again.",
  ],
  ['MACHINE_BINDING_BUSY', "Resolve this printer's pending print requests first."],
  ['MACHINE_CREDENTIAL_SAVE_FAILED', 'Tau could not save the access code to your Keychain.'],
  ['SECRET_VAULT_UNAVAILABLE', 'Tau could not reach your Keychain.'],
  /* Removing a printer that is already gone: the list was behind, and re-reading it is the whole answer. */
  ['MACHINE_DIRECTORY_UNKNOWN_MACHINE', undefined],
]);

/** Refusals a typed code answers: nothing is saved for the printer, or the saved code no longer fits it. */
const asksForCode: ReadonlySet<string | undefined> = new Set([
  'MACHINE_CREDENTIAL_REQUIRED',
  'MACHINE_CREDENTIAL_TRUST_CHANGED',
]);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const refusalCode = (error: unknown): string | undefined => {
  const message = errorMessage(error);
  return [...refusals.keys()].find((code) => message.includes(code));
};

/**
 * The one mapping from a binding or removal failure to what the card says.
 *
 * @param error - What `bind` or `removeBinding` threw.
 * @returns The copy for a known refusal (`undefined` when it needs none), else the error's own message.
 */
const describeRefusal = (error: unknown): string | undefined => {
  const code = refusalCode(error);
  return code === undefined ? errorMessage(error) : refusals.get(code);
};

/**
 * Bind one machine end to end: discover it, begin the host-local ceremony and,
 * when the host asks for the operator's half, complete it through the shell.
 * Discovery here is addressed: "Find on network" has already picked the LAN
 * candidate and filled its address, so the first answer is the machine. A
 * typed code always wins; with none, the host reuses the code it saved for
 * that printer, and when nothing is saved either, the person is asked for the
 * code before any ceremony begins.
 *
 * @param client - Any open project's machines facet, onto this computer's host.
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
  if (input.accessCode === '' && candidate.credential !== 'saved') {
    throw new Error('MACHINE_CREDENTIAL_REQUIRED');
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

/**
 * Listen for the printers advertising on this LAN; the host bounds the pass (Bambu: 11 s on UDP 2021,
 * two advertisement periods). Nothing is sent to a printer: discovery only hears broadcasts.
 *
 * @param client - Any open project's machines facet, onto this computer's host.
 * @param onHeard - Every distinct candidate so far, each time a new one is heard.
 * @returns Every distinct candidate heard, latest advertisement winning.
 */
const findOnNetwork = async (
  client: MachineClient,
  onHeard: (candidates: readonly MachineCandidate[]) => void,
): Promise<readonly MachineCandidate[]> => {
  const found = new Map<string, MachineCandidate>();
  for await (const frame of client.discover({
    providerId: bambuProviderId,
    configuration: { logicalId: 'discovery' },
    signal: AbortSignal.timeout(20_000),
  })) {
    if (frame.type === 'found' || frame.type === 'updated') {
      const isNew = !found.has(frame.candidate.id);
      found.set(frame.candidate.id, frame.candidate);
      if (isNew) {
        onHeard([...found.values()]);
      }
    }
  }
  return [...found.values()];
};

const listeningForMore = 'Listening for more printers…';

const describeOutcome = (name: string, outcome: MachineBindingOutcome): string =>
  outcome.status === 'bound'
    ? `${name} is bound as ${outcome.machineId}.`
    : `${name} is waiting on the printer (ceremony ${outcome.ceremonyId}).`;

/**
 * One bound machine: its name and model at rest, every part of its manifest on request, and Remove beside it.
 * The details start folded so the list stays a one-line-per-machine summary. Removing asks first, in place:
 * the settings dialog does not stack a second dialog.
 */
const BoundMachine = memo(function BoundMachine({
  entry,
  provider,
  onRemove,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  /** Resolves with the refusal to show, or `undefined` once the printer is gone. */
  readonly onRemove: (entry: MachineDirectoryEntry) => Promise<string | undefined>;
}): React.JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const removeButton = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  const consequenceId = useId();
  const { name } = entry.descriptor;

  const toggleConfirming = useCallback(() => {
    setIsConfirming((current) => !current);
    setRefusal(undefined);
  }, []);
  const cancel = useCallback(() => {
    setIsConfirming(false);
    setRefusal(undefined);
    removeButton.current?.focus();
  }, []);
  const remove = useCallback(async () => {
    setIsRemoving(true);
    setRefusal(undefined);
    const answer = await onRemove(entry);
    /* A removed printer leaves the directory, taking this row with it; only a refusal keeps the row. */
    if (answer !== undefined) {
      setIsRemoving(false);
      setRefusal(answer);
    }
  }, [entry, onRemove]);

  return (
    <li className='rounded-md border text-sm'>
      <Collapsible>
        <div className='flex items-center gap-1 pe-1'>
          <CollapsibleTrigger className='group/machine flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 rounded-md px-3 py-2 text-left hover:bg-accent/50'>
            <span className='font-medium'>{name}</span>{' '}
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
          <Button
            ref={removeButton}
            type='button'
            size='icon-sm'
            variant='ghost'
            className='text-muted-foreground'
            aria-label={`Remove ${name}`}
            aria-expanded={isConfirming}
            disabled={isRemoving}
            onClick={toggleConfirming}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
        {isConfirming ? (
          <div
            role='alertdialog'
            aria-labelledby={questionId}
            aria-describedby={consequenceId}
            className='flex flex-col gap-2 border-t px-3 py-2 text-xs'
          >
            <p id={questionId} className='text-sm font-medium'>
              Remove {name}?
            </p>
            <p id={consequenceId}>
              {isSimulatedProvider(entry.providerId)
                ? 'Tau stops watching it.'
                : 'Tau stops watching it and forgets its saved access code. A print in progress keeps running on the printer.'}
            </p>
            {refusal === undefined ? null : (
              <p role='alert' className='flex items-start gap-1.5'>
                <CircleAlert aria-hidden className='mt-px size-3.5 shrink-0 text-feature' />
                {refusal}
              </p>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button type='button' size='sm' variant='destructive' disabled={isRemoving} onClick={remove}>
                {isRemoving ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
                Remove
              </Button>
              <Button type='button' size='sm' variant='outline' disabled={isRemoving} autoFocus onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
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
  const { refresh } = directory;
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  /* Its own flag: a heard printer can be bound while the pass still listens for others. */
  const [finding, setFinding] = useState(false);
  /* The host holds a code for the picked printer and the person has not chosen to type another; never the code. */
  const [isCodeSaved, setIsCodeSaved] = useState(false);
  const [simulatorFields, setSimulatorFields] = useState<Record<string, unknown>>({});
  const [candidates, setCandidates] = useState<readonly MachineCandidate[]>();
  const bindForm = useRef<HTMLFormElement>(null);
  const bindButton = useRef<HTMLButtonElement>(null);
  const entries = directory.snapshot?.entries ?? [];
  const providers = useMemo(
    () => new Map(directory.providers.map((provider) => [provider.id, provider])),
    [directory.providers],
  );
  const simulator = providers.get(simulatorProviderId);

  /** Bind and say how it went; `true` when the host answered with an outcome rather than a refusal. */
  const run = async (name: string, input: BindInput): Promise<boolean> => {
    setBusy(true);
    try {
      setStatus(describeOutcome(name, await bind(client, input)));
      refresh();
      return true;
    } catch (error) {
      setStatus(describeRefusal(error));
      if (asksForCode.has(refusalCode(error))) {
        setIsCodeSaved(false);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = useCallback(
    async (entry: MachineDirectoryEntry): Promise<string | undefined> => {
      try {
        await client.removeBinding({ machineId: entry.machineId });
        setStatus(`${entry.descriptor.name} is removed.`);
        return undefined;
      } catch (error) {
        return describeRefusal(error);
      } finally {
        refresh();
      }
    },
    [client, refresh],
  );

  const formInput = (key: string): HTMLInputElement | undefined => {
    const element = bindForm.current?.elements.namedItem(key);
    return element instanceof HTMLInputElement ? element : undefined;
  };

  /** Fill the form from one heard printer, leaving only the access code to type unless the host holds it. */
  const pick = (candidate: MachineCandidate): void => {
    const isSaved = candidate.credential === 'saved';
    /* Rendered now, so whichever control comes next exists to take focus. */
    flushSync(() => {
      setIsCodeSaved(isSaved);
    });
    const set = (key: string, value: string): void => {
      const input = formInput(key);
      if (input) {
        input.value = value;
      }
    };
    set('name', candidate.name.slice(0, 64));
    set('address', candidate.endpoint.address);
    set('serial', candidate.claimedIdentity.serial ?? '');
    (isSaved ? bindButton.current : formInput('accessCode'))?.focus();
  };

  const enterDifferentCode = (): void => {
    flushSync(() => {
      setIsCodeSaved(false);
    });
    formInput('accessCode')?.focus();
  };

  const onFind = async (): Promise<void> => {
    setFinding(true);
    setCandidates(undefined);
    setStatus('Listening for printers on this network…');
    try {
      // The first printer heard fills the form at once; the pass keeps listening for others.
      const heard = await findOnNetwork(client, (sofar) => {
        setCandidates(sofar);
        setStatus(listeningForMore);
        if (sofar.length === 1 && sofar[0]) {
          pick(sofar[0]);
        }
      });
      setCandidates(heard);
      // A bind finished meanwhile keeps its own message.
      setStatus((current) =>
        heard.length === 0
          ? 'No printer answered. Check it is on this network with LAN mode on, or enter its address.'
          : current === listeningForMore
            ? undefined
            : current,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setFinding(false);
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
    /* The code leaves the document before the ceremony runs; it is never state. The rest stays for a retry. */
    const codeField = formInput('accessCode');
    if (codeField) {
      codeField.value = '';
    }
    if (await run(input.name, { ...input, accessCode })) {
      form.reset();
      setIsCodeSaved(false);
    }
  };

  return (
    <>
      <p className='text-xs text-muted-foreground'>
        Printers set up here are available in every project on this computer. Their access codes are kept in your
        Keychain.
      </p>
      {entries.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No printers yet.</p>
      ) : (
        <ul aria-label='Bound machines' className='flex flex-col gap-2'>
          {entries.map((entry) => (
            <BoundMachine
              key={entry.machineId}
              entry={entry}
              provider={providers.get(entry.providerId)}
              onRemove={remove}
            />
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
            omit={flowFilledFields}
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
        ref={bindForm}
        className='grid gap-3 border-t pt-4 lg:grid-cols-2'
        aria-labelledby='machines-bind-title'
        onSubmit={onBindSubmit}
      >
        <h3 id='machines-bind-title' className='text-sm font-medium lg:col-span-2'>
          Bind a Bambu Lab X1C
        </h3>
        <div className='flex flex-wrap items-center gap-2 lg:col-span-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || finding || !providers.has(bambuProviderId)}
            onClick={onFind}
          >
            Find on network
          </Button>
          {candidates !== undefined && candidates.length > 1
            ? candidates.map((candidate) => (
                <Button
                  key={candidate.id}
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    pick(candidate);
                  }}
                >
                  {candidate.name} · {candidate.endpoint.address}
                </Button>
              ))
            : null}
        </div>
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
        {isCodeSaved ? (
          <div role='group' aria-labelledby='machines-bind-access-code-label' className='grid gap-1.5'>
            <p id='machines-bind-access-code-label' className='text-sm leading-none font-medium'>
              Access code
            </p>
            <p className='flex min-h-8 flex-wrap items-center gap-2 text-sm'>
              Saved in your Keychain
              <Button type='button' size='xs' variant='outline' onClick={enterDifferentCode}>
                Use a different code
              </Button>
            </p>
          </div>
        ) : (
          <div className='grid gap-1.5'>
            <Label htmlFor='machines-bind-access-code'>Access code</Label>
            <PasswordInput id='machines-bind-access-code' name='accessCode' maxLength={64} autoComplete='off' />
          </div>
        )}
        <div className='lg:col-span-2'>
          <Button ref={bindButton} type='submit' size='sm' disabled={busy || !providers.has(bambuProviderId)}>
            Bind
          </Button>
        </div>
      </form>
      <p role='status' aria-live='polite' className='text-xs text-muted-foreground'>
        {status}
      </p>
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
        <CardTitle id='machines-title'>Printers</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {project === undefined ? (
          <p className='text-sm text-muted-foreground'>Open any project to manage this computer&apos;s printers.</p>
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
