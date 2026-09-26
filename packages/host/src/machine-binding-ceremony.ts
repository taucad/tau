/**
 * The native half of a machine binding ceremony, keyed by the printer's
 * identity so an access code is typed once per printer, not once per binding.
 *
 * @public
 */

import { randomUUID } from 'node:crypto';

import { machineCredentialReference } from '@taucad/runtime/machine';
import type { MachineBindingOutcome, MachineTransportTrust } from '@taucad/runtime/machine';
import type { NodeMachineHost } from '@taucad/runtime/host/node';

import { probeCertificateTrust } from '#machine-host.js';
import type { MachineSecretStore } from '#machine-host.js';

/** What one ceremony did with a credential, for a log: never a reference, serial or secret. @public */
export type MachineBindingCeremonyEvent = Readonly<{
  type: 'credential-saved' | 'credential-reused' | 'rollback-failed';
  providerId: string;
}>;

/** Input for {@link completeMachineBinding}. @public */
export type CompleteMachineBindingInput = Readonly<{
  /** The host whose machines channel began the ceremony. */
  host: Pick<NodeMachineHost, 'completeBinding' | 'describeBinding' | 'removeBinding'>;
  /** The custody the host's runtime resolves provider secrets through. */
  secrets: MachineSecretStore;
  /** The scope the ceremony's channel was served under; a binding whose code cannot be saved is removed from it. */
  workspaceId: string;
  ceremonyId: string;
  /** The code the person typed. Absent, the saved code is reused only while the printer presents the certificate it was saved with. */
  accessCode?: string;
  /** Reads one service's certificate pin; defaults to {@link probeCertificateTrust}. */
  probeCertificateTrust?: typeof probeCertificateTrust;
  /** Told once a credential is saved or reused, or when a failed save could not be rolled back. */
  onEvent?: (event: MachineBindingCeremonyEvent) => void;
}>;

/* RFC 6761 reserves `.invalid`, so such an address names no network endpoint:
 * the simulator's `simulator.invalid`. */
const unreachableAddress = /(?:^|\.)invalid$/iu;

type PinnedTrust = Extract<MachineTransportTrust, { type: 'pinned' }>;

/**
 * Pin MQTT, which the provider cannot connect without, and the camera, whose pin only enables stills.
 *
 * @param probe - Reads one service's certificate pin.
 * @param address - The endpoint the provider will connect to.
 * @returns The pins a binding records; no camera pin when the camera does not answer.
 */
const pinServices = async (
  probe: typeof probeCertificateTrust,
  address: string,
): Promise<Readonly<{ mqtt: PinnedTrust; camera?: PinnedTrust }>> => {
  const mqtt = await probe({ address, port: 8883 });
  try {
    return { mqtt, camera: await probe({ address, port: 322 }) };
  } catch {
    /* Stills stay unsupported on this binding. */
    return { mqtt };
  }
};

/**
 * Complete a ceremony `beginBinding` answered with `operator-action-required`.
 *
 * Trust is pinned on first use from the address the provider will connect to:
 * MQTT on 8883 is required, the camera on 322 is best effort. A typed code is
 * staged in memory for the connect and saved to the vault, beside its pins,
 * only once the binding commits, so a wrong code never reaches the vault.
 * Without a typed code the printer's saved code is reused only while its MQTT
 * certificate matches the saved pin, so a device claiming a printer's serial
 * never receives that printer's code. A candidate with no network endpoint
 * binds with no secret and no probe.
 *
 * ponytail: pins are taken silently; when an operator review of the digest is
 * wanted, return the probed trust to the form before committing.
 *
 * @param input - The host, its secret custody and scope, the ceremony and the typed code, if any.
 * @returns The host's own outcome.
 * @throws `MACHINE_BINDING_UNKNOWN_CEREMONY`, `MACHINE_CREDENTIAL_REQUIRED` when no code is typed or saved,
 * `MACHINE_CREDENTIAL_TRUST_CHANGED` when the saved code's pin no longer matches, or
 * `MACHINE_CREDENTIAL_SAVE_FAILED` (the binding is removed again; `cause.code` is the vault's code).
 * @public
 *
 * @example <caption>The desktop services utility completing the ceremony a renderer began</caption>
 * ```typescript
 * import { completeMachineBinding, hostMachineWorkspaceId } from '@taucad/host';
 * import type { MachineSecretStore } from '@taucad/host';
 * import type { NodeMachineHost } from '@taucad/runtime/host/node';
 *
 * export const onBindingFrame = async (
 *   host: NodeMachineHost,
 *   secrets: MachineSecretStore,
 *   frame: Readonly<{ ceremonyId: string; accessCode?: string }>,
 * ) => completeMachineBinding({ host, secrets, workspaceId: hostMachineWorkspaceId, ...frame });
 * ```
 */
export const completeMachineBinding = async (input: CompleteMachineBindingInput): Promise<MachineBindingOutcome> => {
  const { host, secrets, workspaceId, ceremonyId, accessCode } = input;
  const pending = host.describeBinding(ceremonyId);
  if (pending === undefined) {
    throw new Error('MACHINE_BINDING_UNKNOWN_CEREMONY');
  }
  const { providerId, candidate } = pending;
  const { address } = candidate.endpoint;
  if (unreachableAddress.test(address)) {
    return host.completeBinding({ ceremonyId, secretRef: 'none', serviceTrust: {} });
  }
  const { serial } = candidate.claimedIdentity;
  /* A printer that claims no serial gets a reference nothing can find again. */
  const reference =
    serial === undefined
      ? `vault:machine/${providerId}/unidentified-${randomUUID()}`
      : machineCredentialReference(providerId, serial);
  const saved = accessCode === undefined ? await secrets.facts(reference) : undefined;
  if (accessCode === undefined && saved === undefined) {
    throw new Error('MACHINE_CREDENTIAL_REQUIRED');
  }
  const serviceTrust = await pinServices(input.probeCertificateTrust ?? probeCertificateTrust, address);
  const { mqtt, camera } = serviceTrust;
  if (accessCode === undefined) {
    if (saved?.['mqtt'] !== mqtt.digest) {
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
        facts: { mqtt: mqtt.digest, ...(camera === undefined ? {} : { camera: camera.digest }) },
      });
    } catch (error) {
      /* A binding whose code is not saved could never reconnect. */
      try {
        await host.removeBinding({ workspaceId, machineId: outcome.machineId });
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
