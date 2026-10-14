/**
 * Parameter actors for a host that owns no project authority of its own: `tau mcp`, serving whichever folder the
 * agent names (agent plugin UI blueprint G22). Each process writes through a private filesystem authority, so a
 * running daemon or Tau desktop keeps its own writer; the checked write's preconditions still refuse a sidecar that
 * changed on disk since the actor read it.
 */

import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';

import { createParameterActors, parameterKey } from '#parameter-actors.js';
import type { ParameterActorsOptions } from '#parameter-actors.js';

/** Parameter actors over any folder, with their own filesystem authority. @public */
export type LocalParameterActors = Readonly<{
  /** The actor for one entry in one root, created on first use. */
  parameterActor: (root: string, entry: string) => Promise<ParameterSetActor>;
  /** Close every actor once its last write is known, then the authority. */
  close: () => Promise<void>;
}>;

/**
 * Open parameter actors for `tau mcp`.
 *
 * @param options - The runtime client that resolves a root's entries.
 * @returns The actors and their close.
 * @public
 */
export const openLocalParameterActors = (
  options: Pick<ParameterActorsOptions, 'runtimeClient'>,
): LocalParameterActors => {
  /* Made on the first checked write, so a session that edits no parameters leaves nothing behind. */
  let directory: string | undefined;
  /* One writer for this process, over every root it serves. */
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => {
      directory ??= mkdtempSync(join(tmpdir(), 'tau-mcp-authority-'));
      return directory;
    },
    authorityIdentity: () => 'tau-mcp',
  });
  const ports = new MessageChannel();
  const channel = new NodeFsChannel(toNodeFsPort(ports.port2));
  /* The agent names the folder each call works in; the tools already read and write any of them. */
  const stopServer = serveNodeFsProvider(toNodeFsPort(ports.port1), {
    authority,
    allowRoot: () => true,
    policy: tauPathPolicy,
  });
  const actors = createParameterActors({
    open: (root) => new NodeFsProviderClient(channel, root),
    runtimeClient: options.runtimeClient,
  });
  return {
    parameterActor: async (root, entry) => actors.get(parameterKey(root, entry)),
    async close() {
      try {
        await actors.closeAll();
      } finally {
        channel.close();
        await stopServer();
        if (directory !== undefined) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  };
};
