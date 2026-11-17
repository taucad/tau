/**
 * The sign-in contract against the real pinned adapters, not a fake.
 *
 * Each profile with a `package` is resolved from the distributed daemon (where
 * the adapters are declared; `packages/host` deliberately does not depend on
 * them), started with this process's own Node exactly as `spawnAcpAdapter`
 * starts it in production, and sent `initialize` with Tau's own
 * `clientCapabilities`. Its `authMethods` then go through `loginOf`.
 *
 * `initialize` needs no vendor CLI, network or login: the adapter answers it
 * from its own code. The environment is an empty home and an empty PATH, so a
 * signed-in or installed CLI on the runner cannot change the answer. This is
 * the test that fails when a pin bump changes the advertised auth shape; the
 * fakes in `fixtures/fake-agent.ts` cannot.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { client } from '@agentclientprotocol/sdk';
import type { AuthMethod } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it } from 'vitest';

import { acpAgentProfiles, resolveAcpAdapters } from '#acp/registry.js';
import type { AcpAdapter } from '#acp/registry.js';
import { clientCapabilities, loginOf, protocolVersion } from '#acp/session.js';
import { spawnAcpAdapter } from '#acp/spawn.js';

const resolveFrom = new URL('../../../cli/src/commands/serve.ts', import.meta.url).href;

const roots: string[] = [];
const closers: Array<() => void> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    close();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * Start one real adapter and ask it what sign-in it offers.
 *
 * @param adapter - The resolved adapter, run as production runs it.
 * @returns The `authMethods` its `initialize` answered with.
 */
const advertisedAuthMethods = async (adapter: AcpAdapter): Promise<readonly AuthMethod[]> => {
  const home = await mkdtemp(join(tmpdir(), 'tau-acp-contract-'));
  roots.push(home);
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their names.
  const spawned = spawnAcpAdapter({ adapter, cwd: home, environment: { HOME: home, PATH: '' } });
  closers.push(() => {
    spawned.signal('SIGKILL');
  });
  const connection = client({ name: 'tau-host' }).connect(spawned.stream);
  closers.push(() => {
    connection.close();
  });
  const answer = await connection.agent.request('initialize', { protocolVersion, clientCapabilities });
  return answer.authMethods ?? [];
};

const moduleProfiles = acpAgentProfiles.filter((profile) => profile.package !== undefined);

describe.each(moduleProfiles)('the pinned $id adapter ($package@$version)', (profile) => {
  /** Without and with the variable that makes Claude's adapter switch to its remote login shape. */
  it.each<{ readonly shape: string; readonly spawnEnv: Readonly<Record<string, string>> }>([
    { shape: 'local', spawnEnv: {} },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable keeps its vendor name.
    { shape: 'remote', spawnEnv: { NO_BROWSER: '1' } },
  ])(
    'should offer a working sign-in command first for its $shape login shape',
    async ({ spawnEnv }) => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable keeps its name.
      const { agents, refused } = resolveAcpAdapters({ resolveFrom, pins: [profile], environment: { PATH: '' } });
      expect(refused).toEqual([]);
      const [resolved] = agents;
      if (resolved?.modulePath === undefined) {
        expect.fail(`${profile.id} did not resolve to a module adapter`);
      }
      const adapter: AcpAdapter = { ...resolved, spawnEnv: { ...resolved.spawnEnv, ...spawnEnv } };

      const login = loginOf(adapter, await advertisedAuthMethods(adapter));

      expect(login.authMethods[0]).toEqual({
        id: 'cli-login',
        name: `Sign in to ${profile.displayName}`,
        terminalCommand: profile.loginCommand,
      });
      for (const method of login.authMethods) {
        const command = method.terminalCommand ?? '';
        expect(command).not.toContain(process.execPath);
        expect(command).not.toContain(resolved.modulePath);
        expect(command).not.toContain('--cli');
      }
    },
    30_000,
  );
});
