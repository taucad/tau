/**
 * Machines settings card (D10).
 *
 * Printers belong to this computer, not a project: the host behind the app's
 * machines facet owns every binding, so a printer set up here is available in
 * every project, and the card works with no project open. It discovers through
 * that facet, begins a binding through it, and completes the ceremony through
 * the desktop shell, so a typed access code goes to the host, which keeps it in
 * the OS keychain, and never into page state. A printer whose code is already saved binds without
 * one. The simulated X1C binds without an address or a code; it is the dry-run
 * device, and its demo settings come from its own binding declaration. Each
 * bound machine opens to its Testing switch and its provider's manifest
 * (`MachineDetails`); the row itself stays one line, with its Remove action beside it.
 */

import { memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
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
import { Label } from '@taucad/ui/components/label';
import { PasswordInput } from '@taucad/ui/components/password-input';
import { Switch } from '@taucad/ui/components/switch';
import { isSimulatedProvider } from '#components/print/machine-facts.js';
import { ConfigurationFields, MachineDetails } from '#components/settings/machine-details.js';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { printersInUseElsewhere, useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';

const bambuProviderId = 'bambu';
const miniProviderId = 'bambu-a1-mini';
/* Display names by simulator provider; the host slugs each to its id (`simulated-x1c`, blueprint D3), which names its folder. */
const simulatorNames: ReadonlyMap<string, string> = new Map([
  ['bambu-simulator', 'Simulated X1C'],
  ['bambu-a1-mini-simulator', 'Simulated A1 mini'],
  ['grbl-simulator', 'Simulated LongMill'],
  ['makera-carvera-simulator', 'Simulated Carvera'],
]);

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
const bindTitles = { logicalId: 'Name', address: 'Address', serial: 'Serial (optional)' } as const;

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
  ['BAMBU_MANUAL_ADDRESS_INVALID', 'Enter a valid IP address or printer hostname.'],
  [
    'BAMBU_SERIAL_INVALID',
    'The serial does not match the selected printer model. Check Printer details or find it on the network.',
  ],
  [
    'BAMBU_SERIAL_REQUIRED',
    'Open Printer details and enter the serial, or find the printer on the network to fill it automatically.',
  ],
  ['MACHINE_BINDING_BUSY', "Resolve this printer's open jobs first."],
  ['MACHINE_CREDENTIAL_SAVE_FAILED', 'Tau could not save the access code to your Keychain.'],
  ['SECRET_VAULT_UNAVAILABLE', 'Tau could not reach your Keychain.'],
  /* The ceremony's second half goes through the desktop shell, not the facet that words these for every other call. */
  ['MACHINE_STORE_OWNED_ELSEWHERE', printersInUseElsewhere],
  ['AUTHORITY_ALREADY_OWNED', printersInUseElsewhere],
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
 * @param client - This computer's machines facet.
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
 * @param client - This computer's machines facet.
 * @param providerIds - Physical Bambu models offered by this host.
 * @param onHeard - Every distinct candidate so far, each time a new one is heard.
 * @returns Every distinct candidate heard, latest advertisement winning.
 */
const findOnNetwork = async (
  client: MachineClient,
  providerIds: readonly string[],
  onHeard: (candidates: readonly MachineCandidate[]) => void,
): Promise<readonly MachineCandidate[]> => {
  const found = new Map<string, MachineCandidate>();
  await Promise.all(
    providerIds.map(async (providerId) => {
      for await (const frame of client.discover({
        providerId,
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
    }),
  );
  return [...found.values()];
};

const listeningForMore = 'Listening for more printers…';

const describeOutcome = (name: string, outcome: MachineBindingOutcome): string =>
  outcome.status === 'bound'
    ? `${name} is bound as ${outcome.machineId}.`
    : `${name} is waiting on the printer (ceremony ${outcome.ceremonyId}).`;

/** Who turns Testing on or off from this card: the person at this computer. */
const operator = { kind: 'user', id: 'operator', label: 'You' } as const;

/**
 * The per-machine Testing switch. While it is on, controls designed for this machine but not yet qualified on it
 * work for a person, so they can be tried and qualified; an agent never gets them. The host's answer is shown until
 * the directory reports the change, so the switch does not flick back in between.
 */
function TestingSwitch({
  client,
  entry,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
}): React.JSX.Element {
  const [requested, setRequested] = useState<boolean>();
  const [answer, setAnswer] = useState<Readonly<{ from: MachineDirectoryEntry; testing: boolean }>>();
  const [error, setError] = useState<string>();
  const descriptionId = useId();
  const isPending = requested !== undefined;
  const testing = requested ?? (answer?.from === entry ? answer.testing : (entry.testing ?? false));

  const change = async (enabled: boolean): Promise<void> => {
    setRequested(enabled);
    setError(undefined);
    try {
      const updated = await client.setTesting({ machineId: entry.machineId, enabled, requestedBy: operator });
      setAnswer({ from: entry, testing: updated.testing ?? false });
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setRequested(undefined);
    }
  };

  return (
    <div className='flex flex-col gap-1 border-b px-3 py-2'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <span className='text-sm font-medium'>Testing</span>
          <span id={descriptionId} className='text-xs text-muted-foreground'>
            Lets you try controls designed for this machine but not yet qualified on it, so they can be qualified.
            Agents never get them.
          </span>
        </div>
        <span className='flex shrink-0 items-center gap-2'>
          {isPending ? (
            <LoaderCircle
              aria-label='Saving'
              className='size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none'
            />
          ) : null}
          <Switch
            aria-label={`Testing for ${entry.name}`}
            aria-describedby={descriptionId}
            checked={testing}
            disabled={isPending}
            onCheckedChange={(checked) => {
              void change(checked);
            }}
          />
        </span>
      </div>
      {error === undefined ? null : (
        <p role='alert' className='flex items-start gap-1.5 text-xs'>
          <CircleAlert aria-hidden className='mt-px size-3.5 shrink-0 text-feature' />
          Testing could not be changed: {error}
        </p>
      )}
    </div>
  );
}

/**
 * One bound machine: its name and model at rest, every part of its manifest on request, and Remove beside it.
 * The details start folded so the list stays a one-line-per-machine summary. Removing asks first, in place:
 * the settings dialog does not stack a second dialog.
 */
const BoundMachine = memo(function BoundMachine({
  client,
  entry,
  provider,
  onRemove,
}: {
  readonly client: MachineClient;
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
  const { name } = entry;

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
          <TestingSwitch client={client} entry={entry} />
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
  const [simulatorFields, setSimulatorFields] = useState<Readonly<Record<string, Record<string, unknown>>>>({});
  const [selectedProviderId, setSelectedProviderId] = useState(bambuProviderId);
  const [isBinding, setIsBinding] = useState(false);
  const [bindFields, setBindFields] = useState<Record<string, unknown>>({});
  const [candidates, setCandidates] = useState<readonly MachineCandidate[]>();
  const bindForm = useRef<HTMLFormElement>(null);
  const bindButton = useRef<HTMLButtonElement>(null);
  const entries = directory.snapshot?.entries ?? [];
  const providers = useMemo(
    () => new Map(directory.providers.map((provider) => [provider.id, provider])),
    [directory.providers],
  );
  const simulators = directory.providers.filter(({ id }) => simulatorNames.has(id));
  const bambu = providers.get(selectedProviderId);
  const physicalProviders = directory.providers.filter(({ id }) => id === bambuProviderId || id === miniProviderId);

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
        setStatus(`${entry.name} is removed.`);
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
      setSelectedProviderId(candidate.claimedIdentity.model === 'A1 mini' ? miniProviderId : bambuProviderId);
      setIsBinding(true);
    });
    const codeField = formInput('accessCode');
    if (codeField) {
      codeField.value = '';
    }
    setBindFields({
      logicalId: candidate.name.slice(0, 64),
      address: candidate.endpoint.address,
      serial: candidate.claimedIdentity.serial ?? '',
    });
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
      // Advertisements never overwrite the printer the operator is configuring.
      const heard = await findOnNetwork(
        client,
        physicalProviders.map(({ id }) => id),
        (sofar) => {
          setCandidates(sofar);
          setStatus(listeningForMore);
        },
      );
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
      const value = bindFields[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const input = {
      providerId: selectedProviderId,
      name: field('logicalId'),
      address: field('address'),
      serial: field('serial'),
    };
    if (!input.name || !input.address) {
      setStatus('Enter a name and address for the printer.');
      return;
    }
    const accessCodeValue = data.get('accessCode');
    const accessCode = typeof accessCodeValue === 'string' ? accessCodeValue : '';
    /* The code leaves the document before the ceremony runs; it is never state. The rest stays for a retry. */
    const codeField = formInput('accessCode');
    if (codeField) {
      codeField.value = '';
    }
    if (await run(input.name, { ...input, accessCode })) {
      form.reset();
      setBindFields({});
      setIsCodeSaved(false);
      setIsBinding(false);
    }
  };

  return (
    <>
      <p className='text-xs text-muted-foreground'>
        Printers set up here are available in every project on this computer. Their access codes are kept in your
        Keychain.
      </p>
      {/* Without a snapshot the list is unknown (loading, or the store is held elsewhere), not empty. */}
      {directory.snapshot !== undefined && entries.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No printers yet.</p>
      ) : undefined}
      {entries.length === 0 ? undefined : (
        <ul aria-label='Bound machines' className='flex flex-col gap-2'>
          {entries.map((entry) => (
            <BoundMachine
              key={entry.machineId}
              client={client}
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
      <section aria-labelledby='machines-add-title' className='flex flex-col gap-2 border-t pt-4'>
        <h3 id='machines-add-title' className='text-sm font-medium'>
          Add a printer
        </h3>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-auto min-h-8 max-w-full whitespace-normal'
            disabled={busy || finding || physicalProviders.length === 0}
            onClick={onFind}
          >
            {finding ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}Find on
            network
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-auto min-h-8 max-w-full whitespace-normal'
            disabled={busy || physicalProviders.length === 0}
            onClick={() => {
              setIsBinding(true);
              setBindFields({});
              setIsCodeSaved(false);
            }}
          >
            Enter address
          </Button>
        </div>
        {candidates?.map((candidate) => {
          const existing = entries.some((entry) => entry.descriptor.id === candidate.claimedIdentity.serial);
          return (
            <Button
              key={candidate.id}
              type='button'
              variant='outline'
              className='h-auto min-h-9 max-w-full justify-start text-left whitespace-normal'
              disabled={busy || existing}
              onClick={() => {
                pick(candidate);
              }}
            >
              <span className='flex flex-wrap items-baseline gap-x-2'>
                <span>{candidate.name}</span>
                <span className='text-xs text-muted-foreground'>
                  {candidate.claimedIdentity.model} · {candidate.endpoint.address}
                  {existing ? ' · Already added' : ''}
                </span>
              </span>
            </Button>
          );
        })}
      </section>
      {isBinding ? (
        <form
          ref={bindForm}
          className='grid gap-3 border-t pt-4 lg:grid-cols-2'
          aria-labelledby='machines-bind-title'
          onSubmit={onBindSubmit}
        >
          <h3 id='machines-bind-title' className='text-sm font-medium lg:col-span-2'>
            Connect a Bambu Lab printer
          </h3>
          <div className='grid gap-1.5 lg:col-span-2'>
            <Label htmlFor='machines-bind-model'>Printer model</Label>
            <select
              id='machines-bind-model'
              className='min-h-8 rounded-md border bg-background px-2 text-sm'
              value={selectedProviderId}
              onChange={(event) => {
                setSelectedProviderId(event.target.value);
                setBindFields((current) => ({ ...current, serial: '' }));
                setIsCodeSaved(false);
                const codeField = formInput('accessCode');
                if (codeField) {
                  codeField.value = '';
                }
              }}
            >
              {physicalProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.manifest.identity.displayName}
                </option>
              ))}
            </select>
          </div>
          {bambu ? (
            <div className='min-w-0 lg:col-span-2' role='group' aria-label='Printer binding fields'>
              <ConfigurationFields
                providerId={selectedProviderId}
                name='binding'
                configuration={bambu.bindingConfiguration}
                values={bindFields}
                omit={['serial']}
                titles={bindTitles}
                presentation='embedded'
                onChange={setBindFields}
              />
            </div>
          ) : null}
          {bambu ? (
            <Collapsible className='lg:col-span-2'>
              <CollapsibleTrigger className='flex min-h-8 items-center gap-2 text-xs text-muted-foreground'>
                Printer details
                <ChevronDown aria-hidden className='size-3.5' />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ConfigurationFields
                  providerId={selectedProviderId}
                  name='binding'
                  configuration={bambu.bindingConfiguration}
                  values={bindFields}
                  omit={['logicalId', 'address']}
                  titles={bindTitles}
                  presentation='embedded'
                  onChange={setBindFields}
                />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
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
            <Button ref={bindButton} type='submit' size='sm' disabled={busy || bambu === undefined}>
              {busy ? 'Connecting…' : 'Bind'}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={() => {
                setIsBinding(false);
                setBindFields({});
                setIsCodeSaved(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {simulators.map((simulator) => {
        const name = simulatorNames.get(simulator.id) ?? simulator.name;
        const titleId = `machines-simulator-title-${simulator.id}`;
        const fields = simulatorFields[simulator.id] ?? {};
        return (
          <Collapsible key={simulator.id}>
            <section aria-labelledby={titleId} className='flex flex-col gap-2 border-t pt-4'>
              <h3 id={titleId} className='text-sm font-medium'>
                <CollapsibleTrigger className='flex min-h-8 w-full items-center justify-between text-left'>
                  {name}
                  <ChevronDown aria-hidden className='size-4' />
                </CollapsibleTrigger>
              </h3>
              <CollapsibleContent className='flex flex-col gap-2'>
                <p className='text-xs text-muted-foreground'>
                  A dry-run machine with no hardware, address or code. Its settings only change the simulation; they are
                  not machine settings.
                </p>
                <ConfigurationFields
                  providerId={simulator.id}
                  name='binding'
                  configuration={simulator.bindingConfiguration}
                  values={fields}
                  omit={flowFilledFields}
                  onChange={(values) => {
                    setSimulatorFields((current) => ({ ...current, [simulator.id]: values }));
                  }}
                />
                <div>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={async () => run(name, { providerId: simulator.id, name, fields })}
                  >
                    Add {name.charAt(0).toLowerCase() + name.slice(1)}
                  </Button>
                </div>
              </CollapsibleContent>
            </section>
          </Collapsible>
        );
      })}

      <p role='status' aria-live='polite' className='text-xs text-muted-foreground'>
        {status}
      </p>
    </>
  );
}

export function MachinesSettings(): React.JSX.Element {
  const facet = useMachinesFacet();
  return (
    <SettingsSectionCard aria-labelledby='machines-title'>
      <CardHeader>
        <CardTitle id='machines-title'>Printers</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {facet.available ? (
          <MachinesPanel client={facet} />
        ) : (
          <p className='text-sm text-muted-foreground'>Machines are unavailable in this runtime ({facet.reason}).</p>
        )}
      </CardContent>
    </SettingsSectionCard>
  );
}
