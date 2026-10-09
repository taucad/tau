/**
 * The native half of a machine binding ceremony, keyed by the machine's
 * identity so an access code is typed once per machine, not once per binding.
 *
 * @public
 */

import { randomUUID } from 'node:crypto';

import {
  isSimulatedMachine,
  machineCredentialOf,
  machineCredentialReference,
  withMachineCode,
} from '@taucad/runtime/machine';
import type {
  MachineBindingOutcome,
  MachineManifest,
  MachineProvider,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import type { NodeMachineHost } from '@taucad/runtime/host/node';

import { probeCertificateTrust } from '#machine-host.js';
import type { MachineSecretStore } from '#machine-host.js';

/** What one ceremony did with a credential or a pin, for a log: never a reference, serial or secret. @public */
export type MachineBindingCeremonyEvent = Readonly<{
  type: 'credential-saved' | 'credential-reused' | 'rollback-failed' | 'service-unpinned';
  providerId: string;
  /** For `service-unpinned`: the optional service that did not answer, so what it enables stays unsupported. */
  service?: string;
}>;

/** Input for {@link completeMachineBinding}. @public */
export type CompleteMachineBindingInput = Readonly<{
  /** The host whose machines channel began the ceremony. */
  host: Pick<NodeMachineHost, 'completeBinding' | 'describeBinding' | 'removeBinding'>;
  /** The custody the host's runtime resolves provider secrets through; a binding whose code it cannot save is removed again. */
  secrets: MachineSecretStore;
  /** The providers the host serves; the candidate's provider declares whether its machine takes a code and what to pin. */
  providers: ReadonlyArray<Pick<MachineProvider, 'id' | 'manifest'>>;
  ceremonyId: string;
  /** The code the person typed. Absent, the saved code is reused only while the machine presents the certificates it was saved with. */
  accessCode?: string;
  /** Reads one service's certificate pin; defaults to {@link probeCertificateTrust}. */
  probeCertificateTrust?: typeof probeCertificateTrust;
  /** Told once a credential is saved or reused, when an optional service is left unpinned, or when a failed save could not be rolled back. */
  onEvent?: (event: MachineBindingCeremonyEvent) => void;
}>;

type PinnedTrust = Extract<MachineTransportTrust, { type: 'pinned' }>;

/** The TLS services a provider declares its binding pins (`connection.services`). */
type PinnedServices = NonNullable<MachineManifest['connection']['services']>;

/**
 * Pin every declared service at once; a required one that does not answer refuses the binding.
 *
 * @param pinning - The probe, the endpoint the provider will connect to, the services by the `serviceTrust` name the
 * provider reads, and who is told each optional service that did not answer.
 * @returns The pins a binding records.
 */
const pinServices = async (
  pinning: Readonly<{
    probe: typeof probeCertificateTrust;
    address: string;
    services: PinnedServices;
    unpinned: (service: string) => void;
  }>,
): Promise<Readonly<Record<string, PinnedTrust>>> => {
  const probed = await Promise.allSettled(
    pinning.services.map(async ({ port }) => pinning.probe({ address: pinning.address, port })),
  );
  const pinned: Record<string, PinnedTrust> = {};
  for (const [index, { id: service, required }] of pinning.services.entries()) {
    const outcome = probed[index];
    if (outcome?.status === 'fulfilled') {
      pinned[service] = outcome.value;
    } else if (required) {
      throw outcome?.reason instanceof Error ? outcome.reason : new Error('MACHINE_CERTIFICATE_PROBE_FAILED');
    } else {
      pinning.unpinned(service);
    }
  }
  return pinned;
};

/**
 * What the candidate's provider declares its binding needs: a code when its `connection.credential` is `secret`
 * (never for a simulator), and services to pin (`connection.services`) only on a network machine.
 *
 * @param providers - The providers the host serves.
 * @param providerId - The candidate's provider.
 * @returns Whether a code is taken, and the services to pin.
 * @throws `MACHINE_PROVIDER_UNAVAILABLE` when the host serves no such provider.
 */
const bindingNeeds = (
  providers: CompleteMachineBindingInput['providers'],
  providerId: string,
): Readonly<{ code: boolean; services: PinnedServices }> => {
  const provider = providers.find(({ id }) => id === providerId);
  if (provider === undefined) {
    throw new Error('MACHINE_PROVIDER_UNAVAILABLE');
  }
  const { connection } = provider.manifest;
  const simulated = isSimulatedMachine(provider.manifest);
  return {
    code: !simulated && machineCredentialOf(connection) === 'secret',
    services: simulated || connection.transport !== 'network' ? [] : (connection.services ?? []),
  };
};

/**
 * The ceremony itself; {@link completeMachineBinding} gives its refusals their typed code.
 *
 * @param input - As {@link completeMachineBinding} takes it.
 * @returns The host's own outcome.
 */
const bindWithCeremony = async (input: CompleteMachineBindingInput): Promise<MachineBindingOutcome> => {
  const { host, secrets, ceremonyId, accessCode } = input;
  const pending = host.describeBinding(ceremonyId);
  if (pending === undefined) {
    throw new Error('MACHINE_BINDING_UNKNOWN_CEREMONY');
  }
  const { providerId, candidate } = pending;
  const { code, services } = bindingNeeds(input.providers, providerId);
  /* Services are pinned at the network address the provider will connect to; a candidate without one pins nothing. */
  const address = candidate.endpoint.transport === 'network' ? candidate.endpoint.address : undefined;
  if (address === undefined && services.length > 0) {
    throw new Error('MACHINE_BINDING_ENDPOINT_INVALID');
  }
  const pin = async (): Promise<Readonly<Record<string, PinnedTrust>>> =>
    pinServices({
      probe: input.probeCertificateTrust ?? probeCertificateTrust,
      address: address ?? '',
      services,
      unpinned: (service) => {
        input.onEvent?.({ type: 'service-unpinned', providerId, service });
      },
    });
  if (!code) {
    return host.completeBinding({ ceremonyId, secretRef: 'none', serviceTrust: await pin() });
  }
  const { serial } = candidate.claimedIdentity;
  /* A machine that claims no serial gets a reference nothing can find again. */
  const reference =
    serial === undefined
      ? `vault:machine/${providerId}/unidentified-${randomUUID()}`
      : machineCredentialReference(providerId, serial);
  /* A saved code is reused only against a required pin; with none declared, nothing could prove the machine. */
  const required = services.filter((service) => service.required).map(({ id }) => id);
  const saved = accessCode === undefined && required.length > 0 ? await secrets.facts(reference) : undefined;
  if (accessCode === undefined && saved === undefined) {
    throw new Error('MACHINE_CREDENTIAL_REQUIRED');
  }
  const serviceTrust = await pin();
  if (accessCode === undefined) {
    if (required.some((service) => saved?.[service] !== serviceTrust[service]?.digest)) {
      throw new Error('MACHINE_CREDENTIAL_TRUST_CHANGED');
    }
    const reused = await host.completeBinding({ ceremonyId, secretRef: reference, serviceTrust });
    input.onEvent?.({ type: 'credential-reused', providerId });
    return reused;
  }
  const release = secrets.stage(reference, accessCode);
  try {
    const outcome = await host.completeBinding({ ceremonyId, secretRef: reference, serviceTrust });
    if (outcome.status !== 'bound') {
      return outcome;
    }
    try {
      await secrets.save(reference, accessCode, {
        label: `Tau: ${candidate.name} access code`,
        facts: Object.fromEntries(Object.entries(serviceTrust).map(([service, trust]) => [service, trust.digest])),
      });
    } catch (error) {
      /* A binding whose code is not saved could never reconnect. */
      try {
        await host.removeBinding({ machineId: outcome.machineId });
      } catch {
        input.onEvent?.({ type: 'rollback-failed', providerId });
      }
      throw new Error('MACHINE_CREDENTIAL_SAVE_FAILED', {
        cause: { code: error instanceof Error ? error.message : 'SECRET_VAULT_UNAVAILABLE' },
      });
    }
    input.onEvent?.({ type: 'credential-saved', providerId });
    return outcome;
  } finally {
    release();
  }
};

/**
 * Complete a ceremony `beginBinding` answered with `operator-action-required`.
 *
 * What the ceremony asks is what the candidate's provider declares. A machine whose `connection.credential` is
 * `secret` (by default, one whose identity is authenticated) takes an access code or key; a simulated provider, or
 * one that declares no secret (a controller on a serial port), binds with no code. Over the network, the services the provider's binding pins are pinned on
 * first use from the address the provider will connect to: a required one must answer, an optional one that does
 * not is left unpinned and reported. A typed code is staged in memory for the connect and saved to the vault,
 * beside its pins, only once the binding commits, so a wrong code never reaches the vault. Without a typed code the
 * machine's saved code is reused only while every required service presents the certificate it was saved with, so
 * a device claiming a machine's serial never receives that machine's code.
 *
 * ponytail: pins are taken silently; when an operator review of the digest is
 * wanted, return the probed trust to the form before committing.
 *
 * @param input - The host, its providers, its secret custody, the ceremony and the typed code, if any.
 * @returns The host's own outcome.
 * @throws An `Error` whose `code` (and message) is `MACHINE_BINDING_UNKNOWN_CEREMONY`, `MACHINE_PROVIDER_UNAVAILABLE`
 * when the host serves no such provider,
 * `MACHINE_BINDING_ENDPOINT_INVALID` when the provider pins network services and the candidate has no network address,
 * `MACHINE_CREDENTIAL_REQUIRED` when no code is typed or saved, `MACHINE_CREDENTIAL_TRUST_CHANGED` when the saved
 * code's pins no longer match, a required service's probe failure, or `MACHINE_CREDENTIAL_SAVE_FAILED` (the binding
 * is removed again; `cause.code` is the vault's code).
 * @public
 *
 * @example <caption>The desktop services utility completing the ceremony a renderer began</caption>
 * ```typescript
 * import { completeMachineBinding } from '@taucad/host';
 * import type { MachineSecretStore } from '@taucad/host';
 * import type { CreateNodeMachineHostInput, NodeMachineHost } from '@taucad/runtime/host/node';
 *
 * export const onBindingFrame = async (
 *   host: NodeMachineHost,
 *   providers: CreateNodeMachineHostInput['providers'],
 *   secrets: MachineSecretStore,
 *   frame: Readonly<{ ceremonyId: string; accessCode?: string }>,
 * ) => completeMachineBinding({ host, providers, secrets, ...frame });
 * ```
 */
export const completeMachineBinding = async (input: CompleteMachineBindingInput): Promise<MachineBindingOutcome> => {
  try {
    return await bindWithCeremony(input);
  } catch (error) {
    // Every refusal reaches its caller with a typed `code`, whoever the caller is.
    throw withMachineCode(error);
  }
};
