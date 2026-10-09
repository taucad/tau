/**
 * Machines settings card (D10).
 *
 * Machines belong to this computer, not a project: the host behind the app's
 * machines facet owns every binding, so a machine set up here is available in
 * every project, and the card works with no project open. Everything it offers
 * comes from the providers the host serves: a real machine's model, its binding
 * fields and whether it takes an access code all come from its provider; where
 * it is (an address on the network or a serial port, by the manifest's
 * transport) is the contract's `MachineEndpoint`, never a binding field. A
 * provider this host cannot serve is named with the host's reason. It discovers through that facet, begins a binding through it, and
 * completes the ceremony through the desktop shell, so a typed access code goes
 * to the host, which keeps it in the OS keychain, and never into page state. A
 * machine whose code is already saved binds without one. A simulator binds
 * without an address or a code; its demo settings come from its own binding
 * declaration. Each bound machine opens to its Testing switch and its
 * provider's manifest (`MachineDetails`); the row itself stays one line, with
 * its Remove action beside it.
 */

import { memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, CircleAlert, LoaderCircle, Trash2 } from 'lucide-react';
import { fffProcessOf, isSimulatedMachine, machineCredentialOf } from '@taucad/runtime/machine';
import type {
  MachineBindingOutcome,
  MachineCandidate,
  MachineClient,
  MachineDirectoryEntry,
  MachineDiscoverInput,
  MachineEndpoint,
  MachineManifest,
  MachineProvider,
} from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { PasswordInput } from '@taucad/ui/components/password-input';
import { Switch } from '@taucad/ui/components/switch';
import { failureCodeOf } from '#components/print/machine-facts.js';
import { ConfigurationFields, MachineDetails, fieldNames } from '#components/settings/machine-details.js';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { printersInUseElsewhere, useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';

type BindInput = {
  readonly providerId: string;
  /** The name the person gives the machine; the host slugs it to the machine's id (blueprint D3). */
  readonly name: string;
  /** Binding fields chosen through the provider's own declaration, without the name. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** Where the person said the machine is; absent for a simulator, which needs no place. */
  readonly endpoint?: MachineEndpoint;
  /** The code the person typed, `''` when they left it empty; absent for a provider whose binding takes none. */
  readonly accessCode?: string;
};

/** A discovered candidate with the provider that yielded it: the provider it binds through. */
type HeardCandidate = Readonly<{ providerId: string; candidate: MachineCandidate }>;

type Transport = MachineManifest['connection']['transport'];

const noPlace = '';

/** What the card calls where a machine is, by how its provider reaches it. */
const placeLabels: Readonly<Record<Transport, string>> = { network: 'Address', serial: 'Serial port' };

/**
 * The endpoint the person typed, in the transport the provider reaches its machines by. ponytail: no port is asked;
 * each network provider dials its own fixed ports (Bambu refuses an entered one). Add a port field when a provider
 * declares that it takes one.
 *
 * @param transport - The provider's `manifest.connection.transport`.
 * @param place - What the person typed: an address, or a serial port's path.
 * @returns The endpoint, or a sentence saying what to fix.
 */
const endpointOf = (transport: Transport, place: string): MachineEndpoint | string => {
  const where = place.trim();
  if (where === '') {
    return `Enter ${transport === 'network' ? 'an address' : 'a serial port'}.`;
  }
  return transport === 'serial' ? { transport, path: where } : { transport, address: where };
};

/** Where a discovered candidate is, as the form takes it. */
const placeOf = (endpoint: MachineCandidate['endpoint']): string =>
  endpoint.transport === 'serial' ? endpoint.path : endpoint.address;

/** Whether binding takes an access code: the host's ceremony asks one only of a real machine that declares a secret. */
const takesCode = (manifest: MachineManifest): boolean =>
  !isSimulatedMachine(manifest) && machineCredentialOf(manifest.connection) === 'secret';

/** What the card calls one of this provider's machines. */
const nounOf = (manifest: MachineManifest): 'printer' | 'machine' =>
  fffProcessOf(manifest) === undefined ? 'machine' : 'printer';

/**
 * What a person reads for the host's binding and removal refusals, by code; `undefined` means say nothing.
 * The machine channel and the desktop ceremony both carry the typed code; a provider's own refusal is shown in its own
 * words.
 */
const refusals: ReadonlyMap<string, string | undefined> = new Map([
  ['MACHINE_CREDENTIAL_REQUIRED', 'Enter the access code shown on the machine.'],
  [
    'MACHINE_CREDENTIAL_TRUST_CHANGED',
    "The machine's certificate changed since the code was saved. Enter the access code to bind it again.",
  ],
  ['MACHINE_BINDING_BUSY', "Resolve this machine's open jobs first."],
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

/** The desktop shell's invoke prefixes what main threw (an invalid ceremony request); the person reads only the latter. */
const shellPrefix = /^Error invoking remote method '[^']*': (?:\w*Error: )?/u;

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(shellPrefix, '');

/* Read typed only: the machine channel and the desktop ceremony both carry `code`, so a message is never searched. */
const refusalCode = (error: unknown): string | undefined => {
  const code = failureCodeOf(error);
  return code !== undefined && refusals.has(code) ? code : undefined;
};

/**
 * The one mapping from a binding or removal failure to what the card says.
 *
 * @param error - What `bind` or `removeBinding` threw.
 * @returns The copy for a known host refusal (`undefined` when it needs none), else the error's own message.
 */
const describeRefusal = (error: unknown): string | undefined => {
  const code = refusalCode(error);
  return code === undefined ? errorMessage(error) : refusals.get(code);
};

/**
 * Bind one machine end to end: discover it, begin the host-local ceremony and,
 * when the host asks for the operator's half, complete it through the shell.
 * Discovery here is addressed: the form names where the machine is ("Find
 * machines" fills it from the candidate picked), so the first answer is the
 * machine. A typed code always wins; with none, the host reuses the code it
 * saved for that machine, and when nothing is saved either, the person is
 * asked for the code before any ceremony begins.
 *
 * @param client - This computer's machines facet.
 * @param input - What the person typed.
 * @returns The host's own outcome.
 */
const bind = async (client: MachineClient, input: BindInput): Promise<MachineBindingOutcome> => {
  // SAFETY: the Parameters form writes JSON values only, and the host validates the whole configuration
  // against the provider's binding schema before discovery.
  // The name travels in `beginBinding`, never in the provider's binding configuration (U3-18).
  const configuration = input.fields as Readonly<Record<string, MachineDiscoverInput['configuration']>>;
  const abort = new AbortController();
  let candidate;
  try {
    for await (const frame of client.discover({
      providerId: input.providerId,
      configuration,
      ...(input.endpoint === undefined ? {} : { endpoint: input.endpoint }),
      signal: abort.signal,
    })) {
      if (frame.type === 'found' || frame.type === 'updated') {
        candidate = frame.candidate;
        break;
      }
    }
  } finally {
    abort.abort();
  }
  if (candidate === undefined) {
    throw new Error('No machine answered there. Check it is switched on and reachable from this computer.');
  }
  if (input.accessCode === '' && candidate.credential !== 'saved') {
    throw Object.assign(new Error('MACHINE_CREDENTIAL_REQUIRED'), { code: 'MACHINE_CREDENTIAL_REQUIRED' });
  }
  const outcome = await client.beginBinding({ candidate, name: input.name });
  if (outcome.status === 'bound') {
    return outcome;
  }
  const bridge = desktopBridge();
  if (bridge === undefined) {
    throw new Error('This runtime cannot complete the binding ceremony; use the Tau desktop app.');
  }
  /* The shell pins from the endpoint the provider connects to, so only the ceremony and a typed code travel. */
  return bridge.machines.completeBinding({
    ceremonyId: outcome.ceremonyId,
    ...(input.accessCode ? { accessCode: input.accessCode } : {}),
  });
};

/**
 * Ask every real machine provider for what it can find: network providers listen for advertisements, serial
 * providers read this computer's ports. The host bounds each pass; nothing is sent to a machine. One provider's
 * failure does not end the others' passes.
 *
 * @param client - This computer's machines facet.
 * @param providerIds - The real machine providers this host serves.
 * @param onHeard - Every distinct candidate so far, each time a new one is heard.
 * @returns Every distinct candidate heard, latest answer winning, each with its provider, and the first failure.
 */
const findMachines = async (
  client: MachineClient,
  providerIds: readonly string[],
  onHeard: (candidates: readonly HeardCandidate[]) => void,
): Promise<Readonly<{ heard: readonly HeardCandidate[]; failure?: unknown }>> => {
  const found = new Map<string, HeardCandidate>();
  const passes = await Promise.allSettled(
    providerIds.map(async (providerId) => {
      for await (const frame of client.discover({
        providerId,
        configuration: {},
        signal: AbortSignal.timeout(20_000),
      })) {
        if (frame.type === 'found' || frame.type === 'updated') {
          const key = `${providerId}\n${frame.candidate.id}`;
          const isNew = !found.has(key);
          found.set(key, { providerId, candidate: frame.candidate });
          if (isNew) {
            onHeard([...found.values()]);
          }
        }
      }
    }),
  );
  const failed = passes.find((pass) => pass.status === 'rejected');
  return { heard: [...found.values()], ...(failed === undefined ? {} : { failure: failed.reason }) };
};

const lookingForMachines = 'Looking for machines…';
const listeningForMore = 'Listening for more machines…';

const describeOutcome = (name: string, outcome: MachineBindingOutcome): string =>
  outcome.status === 'bound'
    ? `${name} is bound as ${outcome.machineId}.`
    : `${name} is waiting on the machine (ceremony ${outcome.ceremonyId}).`;

const escapeKey = { key: 'Escape' } as const;

/** What removing a machine does, as its manifest says: a stored job runs on without Tau, a streamed one cannot. */
const removalConsequence = (manifest: MachineManifest): string => {
  const { jobs } = manifest;
  const keepsRunning = !isSimulatedMachine(manifest) && jobs.type === 'supported' && jobs.delivery === 'stored';
  return [
    takesCode(manifest) ? 'Tau stops watching it and forgets its saved access code.' : 'Tau stops watching it.',
    keepsRunning ? `A job in progress keeps running on the ${nounOf(manifest)}.` : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(' ');
};

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
            <span role='status' aria-label='Saving' aria-busy='true'>
              <LoaderCircle
                aria-hidden
                className='size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none'
              />
            </span>
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
  const confirmation = useRef<HTMLDivElement>(null);
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
  /* Escape answers the question in place. The settings dialog hears Escape on the document, so the binding is
   * global (taken on the window, first) and only while focus is in the question. */
  useKeybinding(escapeKey, cancel, {
    scope: 'global',
    enabled: () => confirmation.current?.contains(document.activeElement) === true,
  });
  const simulated = provider !== undefined && isSimulatedMachine(provider.manifest);
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
              {simulated ? ' · Simulated' : ''}
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
            ref={confirmation}
            role='alertdialog'
            aria-labelledby={questionId}
            aria-describedby={consequenceId}
            className='flex flex-col gap-2 border-t px-3 py-2 text-xs'
          >
            <p id={questionId} className='text-sm font-medium'>
              Remove {name}?
            </p>
            <p id={consequenceId}>
              {provider === undefined ? 'Tau stops watching it.' : removalConsequence(provider.manifest)}
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

/** The person's binding values as the host takes them: strings trimmed, and a field left empty not sent. */
const chosenFields = (values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => {
      const kept = typeof value === 'string' ? value.trim() : value;
      return kept === '' || kept === undefined ? [] : [[key, kept]];
    }),
  );

/** How the bind form lays out one provider's fields: the card's own name up front, the provider's under details. */
const formLayout = (
  provider: MachineProvider | undefined,
): Readonly<{
  noun: 'printer' | 'machine';
  details: string;
  others: readonly string[];
}> => {
  if (provider === undefined) {
    return { noun: 'machine', details: 'Machine details', others: [] };
  }
  const noun = nounOf(provider.manifest);
  return {
    noun,
    details: noun === 'printer' ? 'Printer details' : 'Machine details',
    others: fieldNames(provider.bindingConfiguration),
  };
};

/** The code typed in the form, `''` when left empty; absent when the provider's binding takes none. */
const typedCode = (form: HTMLFormElement, manifest: MachineManifest): string | undefined => {
  if (!takesCode(manifest)) {
    return undefined;
  }
  const value = new FormData(form).get('accessCode');
  return typeof value === 'string' ? value : '';
};

/** What the status line says once a find pass ends: why nothing came, or nothing over a progress line. */
const statusAfterFind = (current: string | undefined, heardNothing: boolean): string | undefined => {
  if (heardNothing) {
    return 'No machine answered. Check it is switched on and on this network or plugged in, or enter where it is.';
  }
  return current === listeningForMore || current === lookingForMachines ? undefined : current;
};

/** Why the machines this host cannot serve are not offered, each by name with the host's reason. */
function UnavailableMachines({
  providers,
}: {
  readonly providers: readonly MachineProvider[];
}): React.JSX.Element | undefined {
  if (providers.length === 0) {
    return undefined;
  }
  return (
    <ul aria-label='Machines that cannot be added here' className='flex flex-col gap-1 text-xs text-muted-foreground'>
      {providers.map(({ id, manifest, unavailable }) => (
        <li key={id}>
          {manifest.identity.displayName} can&apos;t be added here. {unavailable?.reason}
        </li>
      ))}
    </ul>
  );
}

/** Where the machine is, as its provider reaches it: an address on the network, or a serial port's path. */
function PlaceField({
  transport,
  place,
  onChange,
}: {
  readonly transport: Transport;
  readonly place: string;
  readonly onChange: (place: string) => void;
}): React.JSX.Element {
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor='machines-bind-place'>{placeLabels[transport]}</Label>
      <Input
        id='machines-bind-place'
        value={place}
        maxLength={256}
        autoComplete='off'
        spellCheck={false}
        placeholder={transport === 'network' ? '192.168.1.20' : '/dev/ttyUSB0'}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function MachinesPanel({ client }: { readonly client: MachineClient }): React.JSX.Element {
  const directory = useMachineDirectory(client);
  const { refresh } = directory;
  /* What happened, for the polite live region; a refusal is said apart, as an alert. */
  const [status, setStatus] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  const [busy, setBusy] = useState(false);
  /* Its own flag: a heard machine can be bound while the pass still listens for others. */
  const [finding, setFinding] = useState(false);
  /* The host holds a code for the picked machine and the person has not chosen to type another; never the code. */
  const [isCodeSaved, setIsCodeSaved] = useState(false);
  const [simulatorFields, setSimulatorFields] = useState<Readonly<Record<string, Record<string, unknown>>>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [isBinding, setIsBinding] = useState(false);
  const [bindName, setBindName] = useState('');
  const [bindFields, setBindFields] = useState<Record<string, unknown>>({});
  const [place, setPlace] = useState(noPlace);
  const [candidates, setCandidates] = useState<readonly HeardCandidate[]>();
  const bindForm = useRef<HTMLFormElement>(null);
  const bindButton = useRef<HTMLButtonElement>(null);
  const entries = directory.snapshot?.entries ?? [];
  const providers = useMemo(
    () => new Map(directory.providers.map((provider) => [provider.id, provider])),
    [directory.providers],
  );
  /* The host says which providers it cannot serve here, and why; those are named, never offered. */
  const offered = directory.providers.filter(({ unavailable }) => unavailable === undefined);
  const unavailable = directory.providers.filter((provider) => provider.unavailable !== undefined);
  const simulators = offered.filter(({ manifest }) => isSimulatedMachine(manifest));
  const physicalProviders = offered.filter(({ manifest }) => !isSimulatedMachine(manifest));
  /* Until the person picks a model, the first one the host serves. */
  const selected = selectedProviderId === undefined ? physicalProviders[0] : providers.get(selectedProviderId);

  const say = (outcome: string | undefined, refused?: string): void => {
    setStatus(outcome);
    setRefusal(refused);
  };

  /** Bind and say how it went; `true` when the host answered with an outcome rather than a refusal. */
  const run = async (name: string, input: BindInput): Promise<boolean> => {
    setBusy(true);
    try {
      say(describeOutcome(name, await bind(client, input)));
      refresh();
      return true;
    } catch (error) {
      say(undefined, describeRefusal(error));
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

  const clearCode = (): void => {
    const codeField = formInput('accessCode');
    if (codeField) {
      codeField.value = '';
    }
  };

  /** Fill the form from one heard machine, through the provider that heard it, leaving only a code to type. */
  const pick = ({ providerId, candidate }: HeardCandidate): void => {
    const provider = providers.get(providerId);
    if (provider === undefined) {
      return;
    }
    const isSaved = candidate.credential === 'saved';
    /* Rendered now, so whichever control comes next exists to take focus. */
    flushSync(() => {
      setIsCodeSaved(isSaved);
      setSelectedProviderId(providerId);
      setIsBinding(true);
    });
    clearCode();
    const declared = new Set(fieldNames(provider.bindingConfiguration));
    const heard: Record<string, string | undefined> = { serial: candidate.claimedIdentity.serial };
    setBindName(candidate.name.slice(0, 64));
    setBindFields(chosenFields(Object.fromEntries(Object.entries(heard).filter(([key]) => declared.has(key)))));
    setPlace(placeOf(candidate.endpoint));
    (isSaved || !takesCode(provider.manifest) ? bindButton.current : formInput('accessCode'))?.focus();
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
    say(lookingForMachines);
    // Answers never overwrite the machine the operator is configuring.
    const { heard, failure } = await findMachines(
      client,
      physicalProviders.map(({ id }) => id),
      (sofar) => {
        setCandidates(sofar);
        setStatus(listeningForMore);
      },
    );
    setCandidates(heard);
    // A bind finished meanwhile keeps its own message.
    setStatus((current) => statusAfterFind(current, heard.length === 0 && failure === undefined));
    if (failure !== undefined) {
      setRefusal(describeRefusal(failure));
    }
    setFinding(false);
  };

  const onBindSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (selected === undefined) {
      return;
    }
    const form = event.currentTarget;
    const name = bindName.trim();
    const fields = chosenFields(bindFields);
    if (name === '') {
      say(undefined, `Enter a name for the ${nounOf(selected.manifest)}.`);
      return;
    }
    const endpoint = endpointOf(selected.manifest.connection.transport, place);
    if (typeof endpoint === 'string') {
      say(undefined, endpoint);
      return;
    }
    const accessCode = typedCode(form, selected.manifest);
    /* The code leaves the document before the ceremony runs; it is never state. The rest stays for a retry. */
    clearCode();
    if (
      await run(name, {
        providerId: selected.id,
        name,
        fields,
        endpoint,
        ...(accessCode === undefined ? {} : { accessCode }),
      })
    ) {
      form.reset();
      setBindName('');
      setBindFields({});
      setPlace(noPlace);
      setIsCodeSaved(false);
      setIsBinding(false);
    }
  };

  const { noun: selectedNoun, details, others: otherFields } = formLayout(selected);

  return (
    <>
      <p className='text-xs text-muted-foreground'>
        Machines set up here are available in every project on this computer. Their access codes are kept in your
        Keychain.
      </p>
      {/* Without a snapshot the list is unknown (loading, or the store is held elsewhere), not empty. */}
      {directory.snapshot !== undefined && entries.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No machines yet.</p>
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
        <p role='alert' className='text-xs text-feature'>
          {directory.error}
        </p>
      )}
      <section aria-labelledby='machines-add-title' className='flex flex-col gap-2 border-t pt-4'>
        <h3 id='machines-add-title' className='text-sm font-medium'>
          Add a machine
        </h3>
        <UnavailableMachines providers={unavailable} />
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-auto min-h-8 max-w-full whitespace-normal'
            disabled={busy || finding || physicalProviders.length === 0}
            onClick={onFind}
          >
            {finding ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}Find
            machines
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-auto min-h-8 max-w-full whitespace-normal'
            disabled={busy || physicalProviders.length === 0}
            onClick={() => {
              setIsBinding(true);
              setBindName('');
              setBindFields({});
              setPlace(noPlace);
              setIsCodeSaved(false);
            }}
          >
            Enter details
          </Button>
        </div>
        {candidates?.map((heard) => {
          const { candidate } = heard;
          const model = providers.get(heard.providerId)?.manifest.identity.displayName ?? heard.providerId;
          const existing = entries.some((entry) => entry.descriptor.id === candidate.claimedIdentity.serial);
          return (
            <Button
              key={`${heard.providerId}\n${candidate.id}`}
              type='button'
              variant='outline'
              className='h-auto min-h-9 max-w-full justify-start text-left whitespace-normal'
              disabled={busy || existing}
              onClick={() => {
                pick(heard);
              }}
            >
              <span className='flex flex-wrap items-baseline gap-x-2'>
                <span>{candidate.name}</span>
                <span className='text-xs text-muted-foreground'>
                  {model} · {placeOf(candidate.endpoint)}
                  {existing ? ' · Already added' : ''}
                </span>
              </span>
            </Button>
          );
        })}
      </section>
      {isBinding && selected !== undefined ? (
        <form
          ref={bindForm}
          className='grid gap-3 border-t pt-4 lg:grid-cols-2'
          aria-labelledby='machines-bind-title'
          onSubmit={onBindSubmit}
        >
          <h3 id='machines-bind-title' className='text-sm font-medium lg:col-span-2'>
            Connect a {selected.vendor} {selectedNoun}
          </h3>
          <div className='grid gap-1.5 lg:col-span-2'>
            <Label htmlFor='machines-bind-model'>Model</Label>
            <select
              id='machines-bind-model'
              className='min-h-8 rounded-md border bg-background px-2 text-sm'
              value={selected.id}
              onChange={(event) => {
                const next = providers.get(event.target.value);
                setSelectedProviderId(event.target.value);
                /* The name carries over, and where it is while the transport stays; every other field belongs to the
                 * model left behind. */
                if (next?.manifest.connection.transport !== selected.manifest.connection.transport) {
                  setPlace(noPlace);
                }
                setBindFields({});
                setIsCodeSaved(false);
                clearCode();
              }}
            >
              {physicalProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.vendor} {provider.manifest.identity.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className='grid min-w-0 gap-1.5 lg:col-span-2'>
            <Label htmlFor='machines-bind-name'>Name</Label>
            <Input
              id='machines-bind-name'
              maxLength={64}
              autoComplete='off'
              value={bindName}
              onChange={(event) => {
                setBindName(event.target.value);
              }}
            />
          </div>
          <PlaceField transport={selected.manifest.connection.transport} place={place} onChange={setPlace} />
          {otherFields.length === 0 ? null : (
            <Collapsible className='lg:col-span-2'>
              <CollapsibleTrigger className='flex min-h-8 items-center gap-2 text-xs text-muted-foreground'>
                {details}
                <ChevronDown aria-hidden className='size-3.5' />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ConfigurationFields
                  providerId={selected.id}
                  name='binding'
                  configuration={selected.bindingConfiguration}
                  values={bindFields}
                  presentation='embedded'
                  onChange={setBindFields}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
          {takesCode(selected.manifest) ? (
            isCodeSaved ? (
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
            )
          ) : null}
          <div className='lg:col-span-2'>
            <Button ref={bindButton} type='submit' size='sm' disabled={busy}>
              {busy ? 'Connecting…' : 'Bind'}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={() => {
                setIsBinding(false);
                setBindName('');
                setBindFields({});
                setPlace(noPlace);
                setIsCodeSaved(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {simulators.map((simulator) => {
        /* The provider's own name; the host slugs it to the machine's id (`simulated-x1c`, blueprint D3). */
        const { name } = simulator;
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

      {refusal === undefined ? null : (
        <p role='alert' className='flex items-start gap-1.5 text-xs'>
          <CircleAlert aria-hidden className='mt-px size-3.5 shrink-0 text-feature' />
          {refusal}
        </p>
      )}
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
        <CardTitle id='machines-title'>Machines</CardTitle>
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
