/**
 * The per-user machine store for a host that runs beside project folders: `tau serve --machines` and
 * `tau mcp --machines` (agent plugin UI blueprint W11, G24).
 *
 * Every Tau host on a computer shares `<config>/machines`: the bindings, the job journal and the host's secret vault
 * for access codes. One writer holds it at a time; a second host serves without machines and says why, rather than
 * failing.
 *
 * @public
 */

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import type { HostAdmissionAuthority, HostSessionHandle } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type { CreateNodeMachineHostInput, NodeMachineHost } from '@taucad/runtime/host/node';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';

import { resolveNodeProjectIdentity } from '#project-identity.js';
import { defaultConfigDirectory } from '#credential-store.js';
import {
  createMachineSecretStore,
  createNodeMachineRuntime,
  localMachineFacet,
  machineAgentGrants,
  machineRouteGrants,
  openMachineHostIdentity,
} from '#machine-host.js';
import type { CreateNodeMachineRuntimeOptions } from '#machine-host.js';
import { openSecretVault } from '#secret-vault.js';

/**
 * A machine host over the shared store, with the person's session its route uses and the admission authority that
 * issues and revokes sessions. @public
 */
export type SharedMachineHost = Readonly<{
  host: NodeMachineHost;
  admission: HostAdmissionAuthority;
  session: HostSessionHandle;
}>;

/** Options for {@link openSharedMachineHost}. @public */
export type OpenSharedMachineHostOptions = Readonly<{
  /** The machine providers the host admits. */
  providers: CreateNodeMachineHostInput['providers'];
  /** Finds a job's file. */
  readArtifact: CreateNodeMachineRuntimeOptions['readArtifact'];
  /** Told a provider's warnings and errors, and the host's own failures, in words. */
  onWarning: (warning: Readonly<{ code: 'MACHINE_PROVIDER' | 'MACHINE_HOST'; message: string }>) => void;
  /** Who the session acts for, in the ledger. */
  actorId: string;
  /** The store; `<config>/machines` unless a test names another. */
  storeRoot?: string | undefined;
}>;

/**
 * Open the per-user machine store, `<config>/machines`: the one store the desktop app and every other Tau host on
 * this computer share.
 *
 * One identity beside it, the host's secret vault (`TAU_SECRET_VAULT` overrides its kind), and one trusted session
 * for the route and the tools.
 *
 * @param options - Providers, artifact reader, warning sink and actor.
 * @returns The host and its session, or `undefined` while another Tau app holds the store's writer lock.
 * @public
 */
export const openSharedMachineHost = async (
  options: OpenSharedMachineHostOptions,
): Promise<SharedMachineHost | undefined> => {
  const storeRoot = options.storeRoot ?? join(defaultConfigDirectory(), 'machines');
  const identity = await openMachineHostIdentity(storeRoot);
  const admission = createHostAdmissionAuthority({ hostId: identity.hostId });
  let host: NodeMachineHost;
  try {
    host = await createNodeMachineHost({
      storeRoot,
      ...identity,
      admission,
      providers: options.providers,
      runtime: createNodeMachineRuntime({
        secrets: createMachineSecretStore({
          vault: openSecretVault({ directory: storeRoot, env: process.env }),
          legacyDirectory: storeRoot,
        }),
        readArtifact: options.readArtifact,
        log: (entry) => {
          if (entry.level === 'error' || entry.level === 'warning') {
            options.onWarning({ code: 'MACHINE_PROVIDER', message: entry.message });
          }
        },
      }),
      onError: (error) => {
        options.onWarning({ code: 'MACHINE_HOST', message: error instanceof Error ? error.message : String(error) });
      },
    });
  } catch (error) {
    if ((error as { readonly code?: unknown }).code !== 'AUTHORITY_ALREADY_OWNED') {
      throw error;
    }
    return undefined;
  }
  return {
    host,
    admission,
    session: host.issueSession({ actor: { kind: 'user', id: options.actorId }, grants: machineRouteGrants }),
  };
};

/**
 * The facet an agent's machine tools use: each channel rides an agent session of its own, so the host applies the
 * agent rules whatever a call claims (agents cannot approve or resolve), and the session lives only as long as its
 * channel.
 *
 * @param shared - The open host.
 * @param agentId - Who the agent session acts for.
 * @returns The facet.
 * @public
 */
export const agentMachineFacet = (
  shared: SharedMachineHost,
  agentId: string,
): RuntimeTransportFacet<MachineClient> & Readonly<{ close(): void }> =>
  localMachineFacet((port) => {
    const session = shared.host.issueSession({ actor: { kind: 'agent', id: agentId }, grants: machineAgentGrants });
    const channel = shared.host.serve({ port, session });
    channel.onClose(() => {
      shared.admission.revoke(session);
    });
    return channel;
  });

/** The machines a host beside its project folders offers its tools. @public */
export type LocalMachines = Readonly<{
  /** The facet the tool registry's machine tools use. */
  facet: RuntimeTransportFacet<MachineClient>;
  /**
   * Name the project a folder holds by its durable local identity, and admit the folder for the files jobs name.
   *
   * Read on each call, so a folder that gains a `tau.json` prints from then on and one that loses it stops.
   *
   * @param folder - An absolute folder a call works in.
   * @returns The id, or `undefined` when the folder holds no project, which no job can then run from.
   */
  projectOf(folder: string): Promise<string | undefined>;
  /** Retire the session and release the store. */
  close(): Promise<void>;
}>;

/** Why {@link openLocalMachines} left the store closed. @public */
export type LocalMachinesRefusal = Readonly<{
  /** `in-use`: another Tau app holds the store. `no-project`: `workspaceRoot` holds no `tau.json` and `requireProject` was set. */
  refused: 'in-use' | 'no-project';
}>;

/** Options for {@link openLocalMachines}. @public */
export type OpenLocalMachinesOptions = Omit<OpenSharedMachineHostOptions, 'readArtifact'> &
  Readonly<{
    /** The folder the host starts in. */
    workspaceRoot: string;
    /**
     * Leave the store closed unless `workspaceRoot` holds a project: for a host whose calls all work there, which
     * could otherwise hold the store, keeping the desktop app from its printers, while it can print nothing.
     */
    requireProject?: boolean | undefined;
  }>;

const notFound = (): Error => new Error('MACHINE_ARTIFACT_NOT_FOUND');

/**
 * Read one print artifact from a project folder: only a path inside it, through no symlink that leaves it, and only
 * bytes whose digest the request names.
 *
 * @param root - The folder, as `realpath` names it.
 * @param artifact - The request's artifact reference.
 * @returns The bytes.
 * @throws Error `MACHINE_ARTIFACT_NOT_FOUND` otherwise.
 */
const readProjectArtifact = async (
  root: string,
  artifact: Parameters<CreateNodeMachineRuntimeOptions['readArtifact']>[0],
): Promise<Uint8Array<ArrayBuffer>> => {
  const target = resolve(root, artifact.path);
  const inside = relative(root, target);
  if (inside === '' || isAbsolute(inside) || inside.startsWith(`..${sep}`) || inside === '..') {
    throw notFound();
  }
  /* A symlink inside the folder must not lead out of it. */
  const real = await realpath(target).catch(() => undefined);
  if (real === undefined || !real.startsWith(`${root}${sep}`)) {
    throw notFound();
  }
  const bytes = new Uint8Array(await readFile(real));
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.digest) {
    throw notFound();
  }
  return bytes;
};

/**
 * Resolve a project folder's durable local identity.
 *
 * @param root - The folder, as `realpath` names it.
 * @returns The id, or `undefined` without a valid manifest.
 */
const projectIdIn = async (root: string): Promise<string | undefined> =>
  resolveNodeProjectIdentity({ workspaceRoot: root });

/**
 * Open the shared machine store for a host beside project folders, such as `tau mcp --machines`, whose calls may
 * each name their own folder (Codex names the thread's folder per call).
 *
 * A job's file is read only from a folder {@link LocalMachines.projectOf} named with the id the job
 * carries, and only when its digest matches; a path that leaves the folder is refused.
 *
 * @param options - The start folder, providers, warning sink and actor.
 * @returns The facet and project namer, or why the store was left closed.
 * @public
 */
export const openLocalMachines = async (
  options: OpenLocalMachinesOptions,
): Promise<LocalMachines | LocalMachinesRefusal> => {
  const { workspaceRoot, requireProject, ...shared } = options;
  if (requireProject === true) {
    const root = await realpath(workspaceRoot).catch(() => undefined);
    if (root === undefined || (await projectIdIn(root)) === undefined) {
      return { refused: 'no-project' };
    }
  }
  /* Each folder a call named, by its real path, with the durable identity resolved then. */
  const named = new Map<string, string>();
  const host = await openSharedMachineHost({
    ...shared,
    readArtifact: async (artifact) => {
      const roots = [...named].filter(([, id]) => id === artifact.projectId).map(([root]) => root);
      for (const root of roots) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- folders of one project are tried in turn; the digest picks the one.
          return await readProjectArtifact(root, artifact);
        } catch {
          // ponytail: another folder of the same project may hold the slice.
        }
      }
      throw notFound();
    },
  });
  if (host === undefined) {
    return { refused: 'in-use' };
  }
  const facet = agentMachineFacet(host, options.actorId);
  return {
    facet,
    projectOf: async (folder) => {
      const root = await realpath(folder).catch(() => undefined);
      if (root === undefined) {
        return undefined;
      }
      const id = await projectIdIn(root);
      if (id === undefined) {
        named.delete(root);
      } else {
        named.set(root, id);
      }
      return id;
    },
    close: async () => {
      facet.close();
      await host.host.close();
    },
  };
};
