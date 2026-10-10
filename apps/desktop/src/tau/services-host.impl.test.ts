import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TurnPlacementPort } from '@taucad/agent-host';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient, AgentChannelEndpoint } from '@taucad/agent-host/channel-client';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { acquireNodeAuthorityWriter, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import type * as AgentHost from '@taucad/agent-host';
import type * as AgentLauncher from '@taucad/agent-host/launcher';
import { requireRevisionToolchain } from '@taucad/host';
import type * as TauHost from '@taucad/host';
import type * as AgentTools from '@taucad/host/agent-tools';
import type * as RuntimeClient from '@taucad/runtime/client';
import { createFileSystemBridgeProxy } from '@taucad/runtime/filesystem';
import { serveElectronFileSystemBridgePort } from '@taucad/runtime/electron/utility';
import { wrapMessagePort } from '@taucad/rpc';
import type { WatchEvent } from '@taucad/filesystem';

import { createServicesHost, refusedRuntimePortMessage } from '#tau/services-host.impl.js';
import type { AgentHostConfig, ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

/**
 * Every `createProjectHostActor` call the utility makes, and every project host
 * it served a connection on, in order.
 *
 * The MCP wiring is invisible from the channel — it only shows up in the host's
 * options and its endpoint — so the real factory is wrapped rather than
 * replaced: every other assertion in this file still exercises the genuine
 * host, including its "cannot start the codex agent" refusal.
 */
const projectHostCalls = vi.hoisted(() => [] as Array<Parameters<typeof TauHost.createProjectHostActor>[0]>);
const servedHosts = vi.hoisted(() => [] as TauHost.ProjectHost[]);
const toolRegistryCalls = vi.hoisted(() => [] as Array<Parameters<typeof AgentTools.createHostToolRegistry>[0]>);
const toolRegistries = vi.hoisted(() => [] as Array<ReturnType<typeof AgentTools.createHostToolRegistry>>);
const runtimeClientCalls = vi.hoisted(() => [] as Array<ReturnType<typeof RuntimeClient.createRuntimeClient>>);
/** The options of every model transport the utility built (this test build is self-host, `tauCloudBuildEnabled`). */
const transportCalls = vi.hoisted(
  () => [] as Array<Parameters<typeof AgentHost.createTauCloudGatewayModelTransport>[0]>,
);
/** One-shot hold on the next launcher close, so a test can act while that close is in flight. */
const launcherCloseGate = vi.hoisted(() => ({
  next: undefined as undefined | Readonly<{ entered: () => void; hold: Promise<void> }>,
}));

/* The same `git` + `git lfs` probe the host refuses on (OQ-B8): the row that
 * builds a bundled-git stand-in needs both, so without them it skips rather than
 * dying on `which git-lfs`. */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

vi.mock('@taucad/host', async (importOriginal) => {
  const actual = await importOriginal<typeof TauHost>();
  return {
    ...actual,
    createProjectHostActor: (options: Parameters<typeof TauHost.createProjectHostActor>[0]) => {
      projectHostCalls.push(options);
      return actual.createProjectHostActor({
        ...options,
        serve: (connectionId, host) => {
          servedHosts.push(host);
          options.serve(connectionId, host);
        },
      });
    },
  };
});

vi.mock('@taucad/agent-host', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentHost>();
  return {
    ...actual,
    createGatewayModelTransport: (options: Parameters<typeof actual.createTauCloudGatewayModelTransport>[0]) => {
      transportCalls.push(options);
      return actual.createGatewayModelTransport(options);
    },
  };
});

/* The project host's launcher, with its close held when a test arms the gate. */
vi.mock('@taucad/agent-host/launcher', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentLauncher>();
  return {
    ...actual,
    createAgentLauncher: (options: Parameters<typeof AgentLauncher.createAgentLauncher>[0]) => {
      const launcher = actual.createAgentLauncher(options);
      const { close } = launcher;
      return Object.assign(launcher, {
        close: async () => {
          const gate = launcherCloseGate.next;
          launcherCloseGate.next = undefined;
          if (gate !== undefined) {
            gate.entered();
            await gate.hold;
          }
          return close();
        },
      });
    },
  };
});

vi.mock('@taucad/host/agent-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentTools>();
  return {
    ...actual,
    createHostToolRegistry: (options: Parameters<typeof actual.createHostToolRegistry>[0]) => {
      toolRegistryCalls.push(options);
      const registry = actual.createHostToolRegistry(options);
      toolRegistries.push(registry);
      return registry;
    },
  };
});

vi.mock('@taucad/runtime/client', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeClient>();
  return {
    ...actual,
    createRuntimeClient: (...args: Parameters<typeof actual.createRuntimeClient>) => {
      const client = actual.createRuntimeClient(...args);
      vi.spyOn(client, 'terminate');
      runtimeClientCalls.push(client);
      return client;
    },
  };
});

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

const stubPort = () => ({
  postMessage: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
});

const hostHarness = (overrides: Partial<ServicesHostOptions> = {}) => {
  const serve = vi.fn(() => async () => undefined);
  const log = vi.fn();
  return {
    serve,
    log,
    host: createServicesHost({
      log,
      serve: serve as unknown as ServicesHostOptions['serve'],
      ...overrides,
    }),
  };
};

const frame = (
  data: unknown,
  ports: Array<ReturnType<typeof stubPort>> | readonly UtilityPort[] = [],
): UtilityMessage => ({ data, ports }) as unknown as UtilityMessage;

describe('refusedRuntimePortMessage', () => {
  it('should quote the reason main refused with, so the tool error names it', () => {
    expect(refusedRuntimePortMessage('registerElectronRuntimeMain: refusing to exceed 64 utility processes')).toBe(
      'Main refused the desktop runtime-port request: registerElectronRuntimeMain: refusing to exceed 64 utility processes',
    );
  });

  it('should fall back to the bare refusal when main names no reason', () => {
    /* A main that refused before it could compose one, or a frame without it. */
    for (const silent of [undefined, '', { message: 'not a string' }]) {
      expect(refusedRuntimePortMessage(silent)).toBe('Main refused the desktop runtime-port request.');
    }
  });
});

describe('createServicesHost — root admission', () => {
  it('trusts nothing until main sends the admitted set', () => {
    const { host } = hostHarness();
    expect(host.isTrustedRoot(homeRoot)).toBe(false);
  });

  it('trusts an admitted root and its descendants, and nothing beside them', () => {
    const { host } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    expect(host.isTrustedRoot(homeRoot)).toBe(true);
    expect(host.isTrustedRoot(`${homeRoot}/widget`)).toBe(true);
    expect(host.isTrustedRoot(`${homeRoot}-evil`)).toBe(false);
    expect(host.isTrustedRoot('/')).toBe(false);
    expect(host.isTrustedRoot('relative/path')).toBe(false);
  });

  it('replaces the admitted set rather than accumulating it', () => {
    const { host } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    host.handleMessage(frame({ type: 'allowRoots', roots: ['/tmp/picked'] }));
    expect(host.isTrustedRoot(homeRoot)).toBe(false);
    expect(host.isTrustedRoot('/tmp/picked')).toBe(true);
  });

  it('should still refuse a sibling whose name extends a trusted root', async () => {
    /* Canonicalising both sides must not turn the `sep` guard into a prefix
     * match: `…-evil` stays out under either spelling. */
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-sibling-root-'));
    const { host } = hostHarness();

    try {
      host.handleMessage(frame({ type: 'allowRoots', roots: [sandbox] }));
      expect(host.isTrustedRoot(`${sandbox}-evil`)).toBe(false);
      expect(host.isTrustedRoot(`${realpathSync.native(sandbox)}-evil`)).toBe(false);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});

describe('createServicesHost — concern ports', () => {
  it('serves the node filesystem over the transferred port, gated by the admitted set', () => {
    const { host, serve } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [port]));

    expect(serve).toHaveBeenCalledTimes(1);
    const [, options] = serve.mock.calls[0] as unknown as [
      unknown,
      { allowRoot: (root: string) => boolean; policy: unknown },
    ];
    expect(options.allowRoot(`${homeRoot}/widget`)).toBe(true);
    expect(options.allowRoot('/etc')).toBe(false);
    /* Every provider this host opens enforces the reserved layout, or a symlink
     * inside a checkout resolves onto the control plane (G0-6). */
    expect(options.policy).toBe(tauPathPolicy);
    expect(port.start).toHaveBeenCalled();
  });

  it('serves a main-only runtime filesystem as an exact rooted authority client', async () => {
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    type ServeRuntimeFileSystem = NonNullable<ServicesHostOptions['serveRuntimeFileSystem']>;
    const serveRuntimeFileSystem = vi.fn(
      (_handlers: Parameters<ServeRuntimeFileSystem>[0], _port: Parameters<ServeRuntimeFileSystem>[1]) => bridge,
    );
    const { host, serve } = hostHarness({
      authorityDirectory: '/tmp/tau-desktop-authority-fixture',
      serveRuntimeFileSystem: serveRuntimeFileSystem as ServicesHostOptions['serveRuntimeFileSystem'],
    });
    /* The internal authority every rooted client here derives from enforces the
     * reserved layout too (G0-6). */
    const [, internalOptions] = serve.mock.calls[0] as unknown as [unknown, { policy: unknown }];
    expect(internalOptions.policy).toBe(tauPathPolicy);
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    const port = stubPort();

    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: `${homeRoot}/widget` } }, [
        port,
      ]),
    );

    expect(serveRuntimeFileSystem).toHaveBeenCalledOnce();
    /* The kernel utility executes project code the agent wrote, so what it is
     * served is the agent's view over that exact rooted authority client, not the
     * client itself — the row below pins what the view refuses (W14). */
    expect(serveRuntimeFileSystem.mock.calls[0]?.[0]).toMatchObject({ id: 'composed-view:agent' });
    expect(serveRuntimeFileSystem.mock.calls[0]?.[1]).toBe(port);
    await host.quiesce();
    expect(bridge.dispose).toHaveBeenCalledOnce();
    host.dispose();
  });

  it('should deliver changed PicoGK source during watch admission and after watch readiness', async () => {
    const starter = `using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () => { });

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;
}
`;
    const fixture = `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
Library.Go(Params.VoxelSizeMm, () =>
{
    var radius = Params.RadiusMm;
    Library.oViewer().SetGroupMaterial(0, "3159cf", 0f, 0.7f);
    Library.oViewer().SetGroupMaterial(1, "f2b134", 0f, 0.7f);
    Library.oViewer().Add(Utils.mshCreateCube(new Vector3(radius, radius * 0.5f, radius * 0.25f)), 0);
    Library.oViewer().Add(Voxels.voxSphere(new Vector3(radius * 2f, 0, 0), radius * 0.5f), 1);
});

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 1f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Order = 1)]
    public static float RadiusMm { get; set; } = 12f;
}
`;
    expect(Buffer.byteLength(starter)).toBe(313);
    expect(Buffer.byteLength(fixture)).toBe(761);
    expect(createHash('sha256').update(starter).digest('hex')).toBe(
      '76af0745e78534f33045a8ba17f071d02a578e185405c129f1679cfae2e02ea2',
    );
    expect(createHash('sha256').update(fixture).digest('hex')).toBe(
      '7ff51d066da3d5abf7401ab0451d768daebaef0827a3e41c3ed9a4d3db8d1068',
    );
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-picogk-watch-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(root), mkdir(authorityDirectory)]);
    await writeFile(join(root, 'main.cs'), starter);
    const armed = Promise.withResolvers<void>();
    const acknowledge = Promise.withResolvers<void>();
    const ports = new MessageChannel();
    const host = createServicesHost({
      authorityDirectory,
      log: vi.fn(),
      serveRuntimeFileSystem: (served, port) => {
        const { watch } = served;
        if (watch === undefined) {
          throw new Error('The admitted filesystem has no watch.');
        }

        return serveElectronFileSystemBridgePort(
          {
            ...served,
            async watch(request, handler) {
              const dispose = await watch.call(served, request, handler);
              armed.resolve();
              await acknowledge.promise;
              return dispose;
            },
          },
          port,
        );
      },
    });
    const proxy = createFileSystemBridgeProxy({
      port: wrapMessagePort(ports.port2),
      dispose: () => {
        ports.port2.close();
      },
    });
    try {
      host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
      host.handleMessage(
        frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: root } }, [
          ports.port1 as unknown as UtilityPort,
        ]),
      );
      await proxy.ready;
      await expect(proxy.readFile('main.cs', 'utf8')).resolves.toBe(starter);
      const events: WatchEvent[] = [];
      const subscription = proxy.watchReady({ paths: ['main.cs'] }, (event) => events.push(event));
      await armed.promise;
      await writeFile(join(root, 'main.cs'), fixture);
      acknowledge.resolve();
      await subscription.ready;
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.cs', kind: 'file' });
      });
      await expect(proxy.readFile('main.cs', 'utf8')).resolves.toBe(fixture);
      events.length = 0;
      await writeFile(join(root, 'main.cs'), starter);
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.cs', kind: 'file' });
      });
      await expect(proxy.readFile('main.cs', 'utf8')).resolves.toBe(starter);
      events.length = 0;
      await writeFile(join(root, 'main.cs'), fixture);
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.cs', kind: 'file' });
      });
      await expect(proxy.readFile('main.cs', 'utf8')).resolves.toBe(fixture);
      subscription.unsubscribe();
    } finally {
      acknowledge.resolve();
      proxy.dispose();
      await host.quiesce();
      host.dispose();
      ports.port1.close();
      ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('should refuse the control plane through the runtime filesystem it serves', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-runtime-mask-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(join(root, '.git'), { recursive: true }), mkdir(authorityDirectory)]);
    await Promise.all([
      writeFile(join(root, '.git', 'config'), '[remote "origin"]\n'),
      writeFile(join(root, 'main.ts'), 'export const main = 1;\n'),
    ]);
    type ServeRuntimeFileSystem = NonNullable<ServicesHostOptions['serveRuntimeFileSystem']>;
    let handlers: Parameters<ServeRuntimeFileSystem>[0] | undefined;
    const host = createServicesHost({
      authorityDirectory,
      log: vi.fn(),
      serveRuntimeFileSystem: (served) => {
        handlers = served;
        return { emit: vi.fn(), dispose: vi.fn() };
      },
    });

    try {
      host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
      host.handleMessage(
        frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: root } }, [stubPort()]),
      );
      if (handlers === undefined) {
        throw new Error('The runtime filesystem concern was not served.');
      }

      await expect(handlers.readFile('.git/config', 'utf8')).rejects.toMatchObject({
        code: 'EPERM',
        reason: 'WORKSPACE_MASKED_PATH',
      });
      /* The positive control: the same view still reads the sources the kernel
       * renders, from exactly the root main named. */
      await expect(handlers.readFile('main.ts', 'utf8')).resolves.toBe('export const main = 1;\n');
    } finally {
      host.dispose();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('should serve the runtime filesystem when main names a trusted root by its physical path', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-physical-root-'));
    const alias = `${sandbox}-alias`;
    await symlink(sandbox, alias);
    /* Main admits the spelling the person granted and names the project by its
     * realpath when it mints the kernel's filesystem port. */
    const physical = realpathSync.native(alias);
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    const { host, log } = hostHarness({
      authorityDirectory: join(sandbox, 'authority'),
      serveRuntimeFileSystem: (() => bridge) as ServicesHostOptions['serveRuntimeFileSystem'],
    });
    const port = stubPort();

    try {
      host.handleMessage(frame({ type: 'allowRoots', roots: [alias] }));
      host.handleMessage(
        frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: physical } }, [port]),
      );

      expect(log).toHaveBeenCalledWith('runtime-fs-served', { workspaceRoot: physical });
      expect(port.close).not.toHaveBeenCalled();
    } finally {
      host.dispose();
      /* The link before its target: `rm` follows a directory symlink and
       * refuses it, and only a dangling one is removable that way. */
      await unlink(alias);
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('should warn when it refuses a runtime filesystem root', () => {
    const { host, log } = hostHarness();
    const port = stubPort();

    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: '/etc' } }, [port]),
    );

    /* An info line is how Finding 1 stayed invisible for two lanes: the agent
     * only ever saw "RuntimeClient has been terminated." */
    expect(log).toHaveBeenCalledWith('runtime-fs.untrusted-root', { workspaceRoot: '/etc' }, 'warn');
    expect(port.close).toHaveBeenCalled();
  });

  it('closes a port for a concern it does not serve', () => {
    const { host, serve } = hostHarness();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'unknown' }, [port]));
    expect(serve).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it('ignores a concern frame that carries no port', () => {
    const { host, serve } = hostHarness();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }));
    expect(serve).not.toHaveBeenCalled();
  });
});

describe('createServicesHost — filesystem authority lifetime', () => {
  const createHeldRuntimeWrite = async (outcome: 'success' | 'failure') => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-runtime-drain-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(root), mkdir(authorityDirectory)]);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    type ServeRuntimeFileSystem = NonNullable<ServicesHostOptions['serveRuntimeFileSystem']>;
    let capturedHandlers: Parameters<ServeRuntimeFileSystem>[0] | undefined;
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    const host = createServicesHost({
      authorityDirectory,
      log: vi.fn(),
      serveRuntimeFileSystem: (handlers, port) => {
        void port;
        capturedHandlers = handlers;
        vi.spyOn(handlers, 'writeFile').mockImplementation(async (path, data) => {
          entered.resolve();
          await release.promise;
          if (outcome === 'failure') {
            throw new Error('held runtime write failed');
          }
          await writeFile(join(root, path), data);
        });
        return bridge;
      },
    });
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: root } }, [stubPort()]),
    );
    if (capturedHandlers === undefined) {
      throw new Error('The runtime filesystem concern was not served.');
    }
    return { bridge, entered, handlers: capturedHandlers, host, release, root, sandbox };
  };

  it('waits for a dispatched runtime bridge success reply before quiescing', async () => {
    const fixture = await createHeldRuntimeWrite('success');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;
    const quiescence = fixture.host.quiesce();

    const pending = async (): Promise<'pending'> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      return 'pending';
    };
    await expect(Promise.race([quiescence, pending()])).resolves.toBe('pending');
    fixture.release.resolve();
    await expect(write).resolves.toBeUndefined();
    await quiescence;
    await expect(readFile(join(fixture.root, 'accepted.txt'), 'utf8')).resolves.toBe('settled');

    fixture.host.dispose();
    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('preserves a dispatched runtime bridge failure reply before quiescing', async () => {
    const fixture = await createHeldRuntimeWrite('failure');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;
    const quiescence = fixture.host.quiesce();

    fixture.release.resolve();
    await expect(write).rejects.toThrow('held runtime write failed');
    await expect(quiescence).resolves.toBeUndefined();

    fixture.host.dispose();
    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('hard-closes a held runtime bridge operation during forced disposal', async () => {
    const fixture = await createHeldRuntimeWrite('success');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;

    fixture.host.dispose();
    expect(fixture.bridge.dispose).toHaveBeenCalledOnce();
    fixture.release.resolve();
    await expect(write).resolves.toBeUndefined();

    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('shares one real checked-write owner across overlapping rooted views and drains it on quiesce', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-'));
    const root = join(sandbox, 'home');
    const project = join(root, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(project, { recursive: true }), mkdir(authorityDirectory)]);
    await writeFile(join(project, 'value.txt'), 'old');
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const firstPorts = new MessageChannel();
    const secondPorts = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [firstPorts.port2 as unknown as UtilityPort]));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [secondPorts.port2 as unknown as UtilityPort]));
    const firstChannel = new NodeFsChannel(toNodeFsPort(firstPorts.port1 as unknown as UtilityPort));
    const secondChannel = new NodeFsChannel(toNodeFsPort(secondPorts.port1 as unknown as UtilityPort));
    const parentView = new NodeFsProviderClient(firstChannel, root);
    const projectView = new NodeFsProviderClient(secondChannel, project);

    try {
      const [first, second] = await Promise.all([
        parentView.writeFileChecked({
          path: 'project/value.txt',
          data: 'first',
          preconditions: [{ path: 'project/value.txt', expected: 'old' }],
        }),
        projectView.writeFileChecked({
          path: 'value.txt',
          data: 'second',
          preconditions: [{ path: 'value.txt', expected: 'old' }],
        }),
      ]);
      expect([first.status, second.status].sort()).toEqual(['applied', 'conflict']);

      const quiescence = host.quiesce();
      expect(host.quiesce()).toBe(quiescence);
      await quiescence;
      expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(true);
      expect(existsSync(join(root, 'authority.writer.lock'))).toBe(false);
    } finally {
      firstChannel.close();
      secondChannel.close();
      host.dispose();
      firstPorts.port2.close();
      secondPorts.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('rejects a broad authored root that encloses authority metadata before applying its checked write', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-overlap-'));
    const authorityDirectory = join(sandbox, 'filesystem-authority');
    const contentDirectory = join(sandbox, 'project');
    await Promise.all([mkdir(authorityDirectory), mkdir(contentDirectory)]);
    const target = join(contentDirectory, 'value.txt');
    await writeFile(target, 'old');
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const ports = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [sandbox] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [ports.port2 as unknown as UtilityPort]));
    const channel = new NodeFsChannel(toNodeFsPort(ports.port1 as unknown as UtilityPort));
    const broadView = new NodeFsProviderClient(channel, sandbox);

    try {
      await expect(
        broadView.writeFileChecked({
          path: 'project/value.txt',
          data: 'new',
          preconditions: [{ path: 'project/value.txt', expected: 'old' }],
        }),
      ).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP', applicationState: 'known-not-applied' });
      await expect(readFile(target, 'utf8')).resolves.toBe('old');
      expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(false);
    } finally {
      channel.close();
      await host.quiesce();
      host.dispose();
      ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('refuses physical and symlinked broad roots before reading, listing, stating, or watching authority metadata', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-private-'));
    const alias = `${sandbox}-alias`;
    const authorityDirectory = join(sandbox, 'filesystem-authority');
    await mkdir(authorityDirectory);
    await symlink(sandbox, alias);
    const writer = await acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory });
    await writer.release();
    expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(true);
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const connections = [new MessageChannel(), new MessageChannel()];
    host.handleMessage(frame({ type: 'allowRoots', roots: [sandbox, alias] }));
    for (const connection of connections) {
      host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [connection.port2 as unknown as UtilityPort]));
    }
    const channels = connections.map(({ port1 }) => new NodeFsChannel(toNodeFsPort(port1 as unknown as UtilityPort)));
    const broadViews = [new NodeFsProviderClient(channels[0]!, sandbox), new NodeFsProviderClient(channels[1]!, alias)];

    try {
      await Promise.all(
        broadViews.map(async (broadView) => {
          const metadataPath = 'filesystem-authority/authority.writer.lock';
          await Promise.all([
            expect(broadView.readFile(metadataPath)).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP' }),
            expect(broadView.readdir('filesystem-authority')).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
            expect(broadView.stat(metadataPath)).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP' }),
            expect(broadView.watch({ paths: ['filesystem-authority'] }, () => undefined)).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
          ]);
        }),
      );
    } finally {
      for (const channel of channels) {
        channel.close();
      }
      await host.quiesce();
      host.dispose();
      for (const connection of connections) {
        connection.port2.close();
      }
      await Promise.all([rm(alias, { force: true }), rm(sandbox, { recursive: true, force: true })]);
    }
  });

  it('returns OS writer ownership when an actual MessageChannel client disconnects', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-detach-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(root), mkdir(authorityDirectory)]);
    await writeFile(join(root, 'value.txt'), 'old');
    const log = vi.fn();
    const host = createServicesHost({ authorityDirectory, log });
    const ports = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [ports.port2 as unknown as UtilityPort]));
    const channel = new NodeFsChannel(toNodeFsPort(ports.port1 as unknown as UtilityPort));
    const provider = new NodeFsProviderClient(channel, root);

    try {
      await expect(
        provider.writeFileChecked({
          path: 'value.txt',
          data: 'new',
          preconditions: [{ path: 'value.txt', expected: 'old' }],
        }),
      ).resolves.toMatchObject({ status: 'applied' });
      channel.close();
      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledWith('node-fs-disconnected');
      });
      await expect(acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory })).rejects.toMatchObject({
        code: 'AUTHORITY_ALREADY_OWNED',
      });
      await host.quiesce();
      const replacement = await acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory });
      await replacement.release();
    } finally {
      channel.close();
      await host.quiesce();
      host.dispose();
      ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('waits for every accepted disposer, reports failure, and refuses new concerns', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const pending = [first.promise, second.promise];
    const quiesced = vi.fn();
    const serve = vi.fn(() => {
      const settlement = pending.shift()!;
      return async () => settlement;
    });
    const host = createServicesHost({
      log: vi.fn(),
      quiesced,
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
    host.handleMessage(frame({ type: 'quiesce' }));
    const quiescence = host.quiesce();
    expect(host.quiesce()).toBe(quiescence);

    first.reject(new Error('first disposer failed'));
    await Promise.resolve();
    expect(quiesced).not.toHaveBeenCalled();
    const refused = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [refused]));
    expect(refused.close).toHaveBeenCalledOnce();
    second.resolve();

    await expect(quiescence).rejects.toThrow(/could not quiesce every accepted operation/u);
    await vi.waitFor(() => {
      expect(quiesced).toHaveBeenCalledWith({
        type: 'quiesce-failed',
        message: 'The services host could not quiesce every accepted operation.',
      });
    });
    host.dispose();
  });

  it('reports forced filesystem cleanup failure and never fabricates a later graceful result', async () => {
    const cleanupFailure = new Error('forced cleanup failed');
    const log = vi.fn();
    const quiesced = vi.fn();
    const serve = vi.fn(() => async () => {
      throw cleanupFailure;
    });
    const host = createServicesHost({
      log,
      quiesced,
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    const unhandledRejections: unknown[] = [];
    const observeUnhandled = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', observeUnhandled);

    try {
      host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
      host.dispose();
      host.handleMessage(frame({ type: 'quiesce' }));
      const quiescence = host.quiesce();
      expect(host.quiesce()).toBe(quiescence);

      await expect(quiescence).rejects.toThrow(/forcibly disposed before graceful quiescence/u);
      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledWith('node-fs-dispose-failed', cleanupFailure.message);
        expect(quiesced).toHaveBeenCalledWith({
          type: 'quiesce-failed',
          message: 'The services host was forcibly disposed before graceful quiescence.',
        });
      });
      expect(quiesced).not.toHaveBeenCalledWith({ type: 'quiesced' });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', observeUnhandled);
    }
  });

  it('keeps an already-started graceful settlement when forced disposal follows', async () => {
    const cleanup = Promise.withResolvers<void>();
    const serve = vi.fn(() => async () => cleanup.promise);
    const host = createServicesHost({
      log: vi.fn(),
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));

    const quiescence = host.quiesce();
    host.dispose();
    expect(host.quiesce()).toBe(quiescence);
    cleanup.resolve();

    await expect(quiescence).resolves.toBeUndefined();
  });
});

describe('createServicesHost — agent host configuration', () => {
  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    systemPrompt: 'You are Tau.',
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  };

  it('stores the frame rather than constructing a host', () => {
    /* Nothing is launched by configuration alone: a launcher is scoped to one
     * workspace root, and no root is named until a connection arrives. */
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'agentHost', config }));

    expect(host.agentHostConfig()).toEqual(config);
    expect(log).toHaveBeenCalledWith('agent-host-config-received', {
      gatewayBaseUrl: 'http://localhost:4000/v1/llm',
      /* The utility's own witness of what main discovered; empty here because
       * this frame carries no adapters. */
      externalAgents: [],
    });
    /* The superseded accessor and its `createAgentHost` seam are gone. */
    expect(host).not.toHaveProperty('agentHost');
  });

  it('stays unconfigured until main sends the frame', () => {
    const { host } = hostHarness();
    expect(host.agentHostConfig()).toBeUndefined();
  });

  it('keeps tracking the credential main pushes in, for the launcher that will read it', () => {
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'authToken', token: 'first' }));
    expect(log).toHaveBeenLastCalledWith('credential-updated', {
      present: true,
    });
    host.handleMessage(frame({ type: 'authToken', token: undefined }));
    expect(log).toHaveBeenLastCalledWith('credential-updated', {
      present: false,
    });
  });
});

/* ------------------------------------------------------------------------ */

/**
 * Launcher 2 over a real workspace, driven by the real `serveAgentChannel` and
 * the first-party client — no stub between them, because the thing worth
 * proving is that this utility's binding is the daemon's binding.
 */
describe('createServicesHost — the agentHost concern (launcher 2)', () => {
  const workspaces: string[] = [];
  const clients: AgentChannelClient[] = [];
  const channels: MessageChannel[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    for (const channel of channels.splice(0)) {
      channel.port1.close();
      channel.port2.close();
    }
    for (const host of hosts.splice(0)) {
      host.dispose();
    }
    projectHostCalls.length = 0;
    servedHosts.length = 0;
    toolRegistryCalls.length = 0;
    toolRegistries.length = 0;
    runtimeClientCalls.length = 0;
    /* `dispose` closes each launcher without waiting, and a revision store that
       is still finishing its own creation holds the directory: retry rather than
       fail the test on the teardown of a host that is already going away. */
    await Promise.all(
      workspaces.splice(0).map(async (root) =>
        rm(root, {
          recursive: true,
          force: true,
          maxRetries: 20,
          retryDelay: 50,
        }),
      ),
    );
  });

  /** Hosts to dispose, so the utility's loopback listener never outlives a test. */
  const hosts: Array<ReturnType<typeof createServicesHost>> = [];

  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    systemPrompt: 'You are Tau.',
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  };

  /** A configured host with one real, granted workspace directory. */
  const configuredHost = async (
    overrides: Partial<AgentHostConfig> = {},
    hostOverrides: Partial<ServicesHostOptions> = {},
  ) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    /* The agent host reads through the utility's one authority, as it does in production. */
    const authorityDirectory = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-authority-'));
    workspaces.push(authorityDirectory);
    const harness = hostHarness({ authorityDirectory, serve: serveNodeFsProvider, ...hostOverrides });
    hosts.push(harness.host);
    harness.host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    harness.host.handleMessage(frame({ type: 'agentHost', config: { ...config, ...overrides } }));
    /* The spelling the person granted and the physical one the host files this
       project under; under `$TMPDIR` they differ by `/private`. */
    return { ...harness, workspaceRoot, physicalRoot: realpathSync.native(workspaceRoot) };
  };

  /** One external-agent turn, admitted the way the renderer admits it. */
  const startExternal = async (client: AgentChannelClient, agentId: string): Promise<unknown> =>
    client.execute({
      type: 'start',
      commandId: `start-${agentId}`,
      payload: {
        trigger: 'submit',
        chatId: `chat-${agentId}`,
        runId: `run-${agentId}`,
        message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
        config: {
          agent: { kind: 'acp', id: agentId },
          systemPrompt: 'You are Tau.',
          toolChoice: 'auto',
        },
      },
    });

  /** Attach to a chat nothing wrote: an open launcher answers at once, with nothing to take over. */
  const attachUnwritten = async (client: AgentChannelClient, chatId: string): Promise<unknown> =>
    client.execute({ type: 'attach', commandId: `attach-${chatId}`, payload: { chatId } });
  const unwrittenAttach = { status: 'applied', effect: 'not-applied', details: { takeover: false, endCursor: 0 } };

  /**
   * Hand the host one leg of a `worker_threads` channel and dial the other.
   *
   * `MessagePort` there speaks `on/off/start/close` exactly as Electron's
   * `MessagePortMain` does, which is why one binding spans both.
   */
  // oxlint-disable-next-line max-params -- Keep existing fixture calls intact while exercising the optional host selection.
  const connect = (
    host: ReturnType<typeof hostHarness>['host'],
    workspaceRoot: string,
    projectId = 'proj_test',
    geoSpecEngine?: 'legacy' | 'native',
  ): AgentChannelClient => {
    const channel = new MessageChannel();
    channels.push(channel);
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: {
            workspaceRoot,
            nativeTrustFile: '/trust/widget',
            projectId,
            ...(geoSpecEngine === undefined ? {} : { geoSpecEngine }),
          },
        },
        [channel.port1 as unknown as UtilityPort],
      ),
    );
    const client = createAgentChannelClient({ connect: () => channel.port2 as unknown as AgentChannelEndpoint });
    clients.push(client);
    return client;
  };

  it('answers the T0 vocabulary over the transferred port', async () => {
    const { host, workspaceRoot } = await configuredHost();
    const client = connect(host, workspaceRoot);

    /* An empty workspace has no `.tau/chats/<id>/events.jsonl`, so the honest
     * answer is an empty chat rather than a failure, and opening it creates nothing. */
    await expect(attachUnwritten(client, 'chat-1')).resolves.toMatchObject(unwrittenAttach);
    expect(existsSync(join(workspaceRoot, '.tau', 'chats', 'chat-1'))).toBe(false);
  });

  /**
   * One main-minted runtime port.
   *
   * Every `close` listener is kept, not only the last: the transport wraps the
   * port before this host adds its own, and firing both is what the real
   * disentanglement does.
   */
  const fakeRuntimePort = () => {
    const closeListeners: Array<() => void> = [];
    return {
      closeListeners,
      postMessage: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') {
          closeListeners.push(listener);
        }
      }),
      off: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    };
  };

  /** Main's runtime-port broker, one fresh port per lease. */
  const runtimePortBroker = () => {
    const ports: Array<ReturnType<typeof fakeRuntimePort>> = [];
    const releases: Array<ReturnType<typeof vi.fn>> = [];
    return {
      ports,
      releases,
      requestRuntimePort: vi.fn(async () => {
        const port = fakeRuntimePort();
        const release = vi.fn();
        ports.push(port);
        releases.push(release);
        return { port, release };
      }),
    };
  };

  /** The checkout map the revision tree publishes, driven directly. */
  const turnCheckouts = (): Map<string, TauHost.TurnCheckout> =>
    toolRegistryCalls.at(-1)!.checkouts as Map<string, TauHost.TurnCheckout>;

  const candidateCheckout = (cwd: string): TauHost.TurnCheckout => ({ cwd, mode: 'candidate', baseRevisionId: '' });

  /* The agent's tools ride an agent session of their own (CA-2): a person's acts are not theirs to call. */
  it("should serve the agent tools' machines on an agent session that reads but refuses every person's act", async () => {
    /* The desktop picks the keychain on macOS; no test may touch a person's keychain. */
    vi.stubEnv('TAU_SECRET_VAULT', 'file');
    try {
      const machinesDirectory = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-machines-'));
      workspaces.push(machinesDirectory);
      const { host, workspaceRoot } = await configuredHost({}, { machinesDirectory });
      connect(host, workspaceRoot);
      const facet = toolRegistryCalls.at(-1)!.machines;
      if (facet?.available !== true) {
        throw new Error('The utility offered its agent tools no machines facet.');
      }

      await expect(facet.list({})).resolves.toMatchObject({ entries: [] });
      const person = { kind: 'user', id: 'person', label: 'Person' } as const;
      await expect(facet.setTesting({ machineId: 'any', enabled: true, requestedBy: person })).rejects.toThrow(
        'ROUTE_DENIED',
      );
      await expect(
        facet.approveAction({
          machineId: 'any',
          operationId: 'op-1',
          intent: {
            componentId: 'controller',
            action: 'controller.wake',
            version: 1,
            expectedRunId: null,
            parameters: {},
          },
          decision: 'approve',
          approvedBy: person,
        }),
      ).rejects.toThrow('ROUTE_DENIED');
      await expect(
        facet.beginHold({
          machineId: 'any',
          componentId: 'gantry',
          capabilityRevision: '1',
          operationId: 'hold-1',
          hold: 'motion.jog',
          version: 1,
          parameters: { axis: 'x', direction: 1, feed: 100 },
          requestedBy: person,
          attended: true,
        }),
      ).rejects.toThrow('ROUTE_DENIED');
      /* Deciding a job is a person's (R16), a denial included. */
      await expect(facet.resolveJob({ jobId: 'any', decision: 'deny', resolvedBy: person })).rejects.toThrow(
        'ROUTE_DENIED',
      );
      const discovery = facet.discover({ providerId: 'bambu-simulator', configuration: {} });
      await expect(discovery[Symbol.asyncIterator]().next()).rejects.toThrow('ROUTE_DENIED');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should report a closed runtime port as a host exit, not an explicit terminate', async () => {
    const broker = runtimePortBroker();
    const { host, workspaceRoot } = await configuredHost({}, { requestRuntimePort: broker.requestRuntimePort });
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    const client = await registry.runtimeClient!(workspaceRoot);

    for (const closePort of broker.ports[0]!.closeListeners) {
      closePort();
    }

    /* The transport, not this host, decides what killed the utility: an
     * explicit terminate here beats its host-exit relay window, so the exit
     * code and stderr never reach the agent. */
    await vi.waitFor(() => {
      expect(runtimeClientCalls[0]!.lifecycleState).toBe('terminated');
    });
    await expect(client.describe({ source: { files: { 'main.ts': 'model' } } })).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
      causeKind: 'transport-closed',
    });
    expect(runtimeClientCalls[0]!.terminate).not.toHaveBeenCalled();
    /* The lease still goes back to main, so no kernel utility outlives it. */
    expect(broker.releases[0]).toHaveBeenCalled();
  });

  it('should admit a candidate checkout named by its physical path', async () => {
    const authorityDirectory = await mkdtemp(join(tmpdir(), 'tau-desktop-candidate-authority-'));
    workspaces.push(authorityDirectory);
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    const { host, log, workspaceRoot } = await configuredHost(
      {},
      {
        authorityDirectory,
        serveRuntimeFileSystem: (() => bridge) as ServicesHostOptions['serveRuntimeFileSystem'],
      },
    );
    connect(host, workspaceRoot);
    const cwd = join(dirname(workspaceRoot), '.tau', 'checkouts', 'proj_test', 'b1');
    turnCheckouts().set('run-1', candidateCheckout(cwd));
    const physical = join(realpathSync.native(dirname(workspaceRoot)), '.tau', 'checkouts', 'proj_test', 'b1');
    const port = stubPort();

    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: physical } }, [port]),
    );

    expect(log).toHaveBeenCalledWith('runtime-fs-served', { workspaceRoot: physical });
    expect(port.close).not.toHaveBeenCalled();
  });

  it("should keep the runtime client and main's grant while another run holds the checkout", async () => {
    const runtimeContext = vi.fn();
    const broker = runtimePortBroker();
    const { host, physicalRoot, workspaceRoot } = await configuredHost(
      {},
      { requestRuntimePort: broker.requestRuntimePort, runtimeContext },
    );
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    const cwd = join(dirname(workspaceRoot), '.tau', 'checkouts', 'proj_test', 'b1');
    const checkouts = turnCheckouts();
    checkouts.set('run-1', candidateCheckout(cwd));
    checkouts.set('run-2', candidateCheckout(cwd));
    const client = await registry.runtimeClient!(cwd);

    checkouts.delete('run-1');

    expect(runtimeClientCalls[0]!.terminate).not.toHaveBeenCalled();
    expect(runtimeContext).not.toHaveBeenCalledWith('release', cwd, physicalRoot);
    await expect(registry.runtimeClient!(cwd)).resolves.toBe(client);
  });

  it("should release main's grant and terminate the client when the last run leaves", async () => {
    const runtimeContext = vi.fn();
    const broker = runtimePortBroker();
    const { host, physicalRoot, workspaceRoot } = await configuredHost(
      {},
      { requestRuntimePort: broker.requestRuntimePort, runtimeContext },
    );
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    const cwd = join(dirname(workspaceRoot), '.tau', 'checkouts', 'proj_test', 'b1');
    const checkouts = turnCheckouts();
    checkouts.set('run-1', candidateCheckout(cwd));
    checkouts.set('run-2', candidateCheckout(cwd));
    await registry.runtimeClient!(cwd);

    checkouts.delete('run-1');
    checkouts.delete('run-2');

    await vi.waitFor(() => {
      expect(runtimeClientCalls[0]!.terminate).toHaveBeenCalledOnce();
    });
    expect(runtimeContext.mock.calls.filter(([action]) => action === 'release')).toEqual([
      ['release', cwd, physicalRoot],
    ]);
  });

  it('should terminate a client that was still connecting when its last run settled, and connect its caller afresh', async () => {
    type RuntimeLease = Awaited<ReturnType<NonNullable<ServicesHostOptions['requestRuntimePort']>>>;
    const leases: Array<ReturnType<typeof Promise.withResolvers<RuntimeLease>>> = [];
    const requestRuntimePort = vi.fn(async () => {
      const lease = Promise.withResolvers<RuntimeLease>();
      leases.push(lease);
      return lease.promise;
    });
    const { host, workspaceRoot } = await configuredHost({}, { requestRuntimePort });
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    const cwd = join(dirname(workspaceRoot), '.tau', 'checkouts', 'proj_test', 'b1');
    const checkouts = turnCheckouts();
    checkouts.set('run-1', candidateCheckout(cwd));
    const connecting = registry.runtimeClient!(cwd);
    await vi.waitFor(() => {
      expect(requestRuntimePort).toHaveBeenCalledOnce();
    });

    checkouts.delete('run-1');
    leases[0]!.resolve({ port: fakeRuntimePort(), release: vi.fn() });

    await vi.waitFor(() => {
      expect(runtimeClientCalls[0]!.terminate).toHaveBeenCalledOnce();
    });
    /* W6.r1 finding 15: the caller still connecting is never handed the client being closed; it gets a fresh one. */
    await vi.waitFor(() => {
      expect(requestRuntimePort).toHaveBeenCalledTimes(2);
    });
    leases[1]!.resolve({ port: fakeRuntimePort(), release: vi.fn() });
    expect(await connecting).toBe(runtimeClientCalls[1]);
    checkouts.set('run-2', candidateCheckout(cwd));
    expect(await registry.runtimeClient!(cwd)).toBe(runtimeClientCalls[1]);
  });

  it('should never serve a terminated client from the cache', async () => {
    const broker = runtimePortBroker();
    const { host, workspaceRoot } = await configuredHost({}, { requestRuntimePort: broker.requestRuntimePort });
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    const first = await registry.runtimeClient!(workspaceRoot);

    /* A render timeout terminates the client locally; Electron reports no
     * `close` for a port this side shut, so nothing evicts it. */
    runtimeClientCalls[0]!.terminate();

    await expect(registry.runtimeClient!(workspaceRoot)).resolves.not.toBe(first);
    expect(runtimeClientCalls).toHaveLength(2);
    expect(runtimeClientCalls[1]!.lifecycleState).not.toBe('terminated');
  });

  it('should share one reconnect between concurrent callers of a terminated client', async () => {
    const broker = runtimePortBroker();
    const { host, workspaceRoot } = await configuredHost({}, { requestRuntimePort: broker.requestRuntimePort });
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    await registry.runtimeClient!(workspaceRoot);

    runtimeClientCalls[0]!.terminate();
    const [first, second] = await Promise.all([
      registry.runtimeClient!(workspaceRoot),
      registry.runtimeClient!(workspaceRoot),
    ]);

    /* The caller that loses the race would hold a live client and a main lease
       that neither map can reach, so nothing ever terminates it. */
    expect(first).toBe(second);
    expect(runtimeClientCalls).toHaveLength(2);
    expect(broker.ports).toHaveLength(2);
  });

  it('should release the agent host when main names the project by its physical path', async () => {
    const released = vi.fn();
    const { host, log, workspaceRoot } = await configuredHost({}, { agentHostReleased: released });
    const channel = new MessageChannel();
    channels.push(channel);
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: { workspaceRoot, projectId: 'proj_test', attachmentGeneration: '1' },
        },
        [channel.port1 as unknown as UtilityPort],
      ),
    );

    /* Main keys its own registry by the realpath while the renderer holds the
       spelling the person granted, and under `$TMPDIR` those differ. */
    host.handleMessage(
      frame({
        type: 'agent-host-release',
        requestId: 'release-physical',
        workspaceRoot: realpathSync.native(workspaceRoot),
        projectId: 'proj_test',
        attachmentGeneration: 1,
      }),
    );
    await vi.waitFor(
      () => {
        expect(released).toHaveBeenCalledWith('release-physical');
      },
      { timeout: 10_000 },
    );

    /* A release that reported success and left the launcher running is worse
       than a refusal: main has already dropped the grant it needs. */
    connect(host, workspaceRoot);
    expect(log.mock.calls.findLast(([event]) => event === 'agent-host-served')?.[1]).toMatchObject({
      reused: false,
    });
  });

  /* L6 N2 / L2b HD-7 / W0.11: main allows a retain while a release is in
   * flight. A remount whose connect arrived while the launcher was closing
   * adopted it, the release finished closing it, and every later command
   * answered LAUNCHER_CLOSED until the next release. */
  it('should serve a remount that arrives during release on a fresh launcher', async () => {
    const released = vi.fn();
    const { host, log, workspaceRoot } = await configuredHost({}, { agentHostReleased: released });
    const connectAt = (attachmentGeneration: string): AgentChannelClient => {
      const channel = new MessageChannel();
      channels.push(channel);
      host.handleMessage(
        frame(
          {
            type: 'concern',
            concern: 'agentHost',
            context: { workspaceRoot, projectId: 'proj_test', attachmentGeneration },
          },
          [channel.port1 as unknown as UtilityPort],
        ),
      );
      const client = createAgentChannelClient({ connect: () => channel.port2 as unknown as AgentChannelEndpoint });
      clients.push(client);
      return client;
    };
    connectAt('1');
    const entered = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    launcherCloseGate.next = { entered: entered.resolve, hold: hold.promise };
    host.handleMessage(
      frame({
        type: 'agent-host-release',
        requestId: 'release-1',
        workspaceRoot,
        projectId: 'proj_test',
        attachmentGeneration: 1,
      }),
    );
    await entered.promise;

    const remount = connectAt('2');
    hold.resolve();
    await vi.waitFor(
      () => {
        expect(released).toHaveBeenCalledWith('release-1');
      },
      { timeout: 10_000 },
    );

    await expect(attachUnwritten(remount, 'chat-1')).resolves.toMatchObject(unwrittenAttach);
    expect(
      log.mock.calls.filter(([event]) => event === 'agent-host-served').map(([, detail]) => detail as unknown),
    ).toMatchObject([{ reused: false }, { reused: false }]);
  });

  it('should keep quiesce pending through a failed close retry', async () => {
    const quiesced = vi.fn();
    const { host, workspaceRoot } = await configuredHost({}, { quiesced });
    const client = connect(host, workspaceRoot);
    await attachUnwritten(client, 'chat-1');
    const entered = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const { revisions } = servedHosts.at(-1)!;
    const { release } = revisions;
    let writes = 0;
    vi.spyOn(revisions, 'release').mockImplementation(async () => {
      writes += 1;
      if (writes === 1) {
        throw new Error('The first revision write failed.');
      }
      entered.resolve();
      await hold.promise;
      await release();
    });

    const quiescence = host.quiesce();
    try {
      await entered.promise;
      await expect(
        Promise.race([
          quiescence.then(
            () => 'settled',
            () => 'settled',
          ),
          new Promise<'pending'>((resolve) => {
            setTimeout(() => {
              resolve('pending');
            }, 50);
          }),
        ]),
      ).resolves.toBe('pending');
      expect(quiesced).not.toHaveBeenCalled();
    } finally {
      hold.resolve();
    }
    await expect(quiescence).rejects.toThrow('could not quiesce every accepted operation');
    expect(writes).toBe(2);
    host.handleMessage(frame({ type: 'quiesce' }));
    await vi.waitFor(() => {
      expect(quiesced).toHaveBeenCalledWith({
        type: 'quiesce-failed',
        message: 'The services host could not quiesce every accepted operation.',
      });
    });
  });

  it('should wait for a retired host retry when release failed before quiesce', async () => {
    const released = vi.fn();
    const { host, workspaceRoot } = await configuredHost({}, { agentHostReleased: released });
    const client = connect(host, workspaceRoot);
    await attachUnwritten(client, 'chat-1');
    const entered = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const { revisions } = servedHosts.at(-1)!;
    const { release } = revisions;
    let writes = 0;
    vi.spyOn(revisions, 'release').mockImplementation(async () => {
      writes += 1;
      if (writes === 1) {
        throw new Error('The first revision write failed.');
      }
      entered.resolve();
      await hold.promise;
      await release();
    });

    host.handleMessage(
      frame({
        type: 'agent-host-release',
        requestId: 'release-1',
        workspaceRoot,
        projectId: 'proj_test',
        attachmentGeneration: 1,
      }),
    );
    await entered.promise;
    expect(released).toHaveBeenCalledWith('release-1', 'The first revision write failed.');
    const quiescence = host.quiesce();
    try {
      await expect(
        Promise.race([
          quiescence.then(
            () => 'settled',
            () => 'settled',
          ),
          new Promise<'pending'>((resolve) => {
            setTimeout(() => {
              resolve('pending');
            }, 50);
          }),
        ]),
      ).resolves.toBe('pending');
    } finally {
      hold.resolve();
    }
    await expect(quiescence).resolves.toBeUndefined();
    expect(writes).toBe(2);
  });

  it('keeps one always-on launcher per root across connections', async () => {
    const { host, log, physicalRoot, workspaceRoot } = await configuredHost();
    connect(host, workspaceRoot);
    connect(host, workspaceRoot);

    const served = log.mock.calls.filter(([event]) => event === 'agent-host-served');
    expect(served).toEqual([
      ['agent-host-served', { workspaceRoot: physicalRoot, reused: false }],
      /* A second window on the same project attaches to the run already
         executing; a second launcher would fork the durable log. */
      ['agent-host-served', { workspaceRoot: physicalRoot, reused: true }],
    ]);
  });

  it.each([undefined, 'legacy', 'native'] as const)(
    'should publish the selected %s desktop authoring recipe before a model turn',
    async (geoSpecEngine) => {
      const { host, workspaceRoot } = await configuredHost();
      const client = connect(host, workspaceRoot, 'proj_test', geoSpecEngine);
      await expect(attachUnwritten(client, 'chat-guidance')).resolves.toMatchObject(unwrittenAttach);
      expect(toolRegistryCalls).toHaveLength(1);
      expect(projectHostCalls[0]!.host()).not.toHaveProperty('geospecAuthoringMode');
      expect(toolRegistryCalls[0]).not.toHaveProperty('geospecAuthoringMode');
      const description = toolRegistries[0]?.list().find((tool) => tool.name === 'test_model')?.description;
      expect(description).toContain('expectGeo');
      expect(description).toContain('loadModel');
      expect(description).not.toContain('expectNativeGeo');
    },
  );

  it.each(['legacy', 'native'] as const)(
    'routes the %s GeoSpec runner through the supervised geometry port',
    async (geoSpecEngine) => {
      const geometryChannel = new MessageChannel();
      const requestGeometryPort = vi.fn(async () => geometryChannel.port1 as unknown as UtilityPort);
      const requestRuntimePort = vi.fn(async () => {
        throw new Error('GeoSpec must not request a runtime port from services.');
      });
      const { host, physicalRoot, workspaceRoot } = await configuredHost(
        {},
        { requestGeometryPort, requestRuntimePort },
      );
      const client = connect(host, workspaceRoot, 'proj_test', geoSpecEngine);
      await expect(attachUnwritten(client, `chat-geospec-${geoSpecEngine}`)).resolves.toMatchObject(unwrittenAttach);
      const runnerOption = projectHostCalls[0]!.host().geospecRunner;
      if (!runnerOption) {
        throw new Error('The desktop project host has no GeoSpec runner.');
      }
      const runner = await runnerOption(physicalRoot);
      const received = vi.fn();
      geometryChannel.port2.on('message', (message) => {
        received(message);
        geometryChannel.port2.postMessage({
          type: 'result',
          result: { success: true, passed: 1, failed: 0, selectedTests: 1, files: [] },
        });
      });
      try {
        expect(requestGeometryPort).toHaveBeenCalledExactlyOnceWith(physicalRoot);
        expect(requestRuntimePort).not.toHaveBeenCalled();
        expect(runtimeClientCalls).toHaveLength(0);
        await expect(runner.run({ files: ['model.test.ts'] })).resolves.toMatchObject({ success: true });
        expect(received).toHaveBeenCalledWith({ type: 'run', options: { files: ['model.test.ts'] } });
      } finally {
        await runner.close();
        geometryChannel.port2.close();
      }
    },
  );

  it('should ignore obsolete GeoSpec engine hints before opening a project host', async () => {
    const { host, log, workspaceRoot } = await configuredHost();
    const port = stubPort();
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: { workspaceRoot, projectId: 'proj_test', geoSpecEngine: 'unknown' },
        },
        [port],
      ),
    );

    await vi.waitFor(() => {
      expect(projectHostCalls).toHaveLength(1);
    });
    expect(log).not.toHaveBeenCalledWith('agent-host.invalid-geospec-engine', { geoSpecEngine: 'unknown' });
    expect(port.close).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'native'] as const)(
    'should reuse the root host across obsolete %s hints and an observer with no hint',
    async (geoSpecEngine) => {
      const { host, log, physicalRoot, workspaceRoot } = await configuredHost();
      const first = connect(host, workspaceRoot, 'proj_test', geoSpecEngine);
      await expect(attachUnwritten(first, 'chat-choice')).resolves.toMatchObject(unwrittenAttach);
      connect(host, workspaceRoot, 'proj_test', geoSpecEngine);
      connect(host, workspaceRoot);
      connect(host, workspaceRoot, 'proj_test', geoSpecEngine === 'native' ? 'legacy' : 'native');

      expect(toolRegistryCalls).toHaveLength(1);
      expect(log.mock.calls.filter(([event]) => event === 'agent-host-served')).toEqual([
        ['agent-host-served', { workspaceRoot: physicalRoot, reused: false }],
        ['agent-host-served', { workspaceRoot: physicalRoot, reused: true }],
        ['agent-host-served', { workspaceRoot: physicalRoot, reused: true }],
        ['agent-host-served', { workspaceRoot: physicalRoot, reused: true }],
      ]);
      // The original launcher still serves its existing channel.
      await expect(attachUnwritten(first, 'chat-choice-still-served')).resolves.toMatchObject(unwrittenAttach);
    },
  );

  it('awaits one project release without stopping another launcher', async () => {
    const released = vi.fn();
    const { host, log, physicalRoot, workspaceRoot } = await configuredHost({}, { agentHostReleased: released });
    const otherRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-other-'));
    workspaces.push(otherRoot);
    host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot, otherRoot] }));
    const projectA = connect(host, workspaceRoot, 'project-a');
    connect(host, otherRoot, 'project-b');
    projectA.close();

    host.handleMessage(
      frame({
        type: 'agent-host-release',
        requestId: 'release-a',
        workspaceRoot,
        projectId: 'project-a',
      }),
    );
    await vi.waitFor(
      () => {
        expect(released).toHaveBeenCalledWith('release-a');
      },
      { timeout: 10_000 },
    );

    connect(host, otherRoot, 'project-b');
    connect(host, workspaceRoot, 'project-a');
    expect(log.mock.calls.filter(([event]) => event === 'agent-host-served').slice(-2)).toEqual([
      ['agent-host-served', { workspaceRoot: realpathSync.native(otherRoot), reused: true }],
      ['agent-host-served', { workspaceRoot: physicalRoot, reused: false }],
    ]);
  });

  /* W8 D13 (RH-S11): the desktop places a turn the way the daemon does, so its project host takes the same factory. */
  it("should build each project host's placement port from the factory it was given", async () => {
    const reconcile = vi.fn<TurnPlacementPort['reconcile']>(async ({ requestId }) => ({
      requestId,
      status: 'applied',
      held: [],
    }));
    const unused = async (): Promise<never> => {
      throw new Error('Not placed in this test.');
    };
    const turnPlacement = vi.fn<NonNullable<ServicesHostOptions['turnPlacement']>>(() => ({
      admit: unused,
      complete: unused,
      abandon: unused,
      acknowledge: unused,
      reconcile,
      settlements: () => ({
        [Symbol.asyncIterator]: async function* nothing(): AsyncGenerator<never> {
          yield* [];
        },
      }),
    }));
    const { host, workspaceRoot } = await configuredHost({}, { turnPlacement });
    connect(host, workspaceRoot);

    await vi.waitFor(
      () => {
        expect(reconcile).toHaveBeenCalledOnce();
      },
      { timeout: 10_000 },
    );
    expect(turnPlacement).toHaveBeenCalledOnce();
    expect(turnPlacement.mock.calls[0]![0].revisions).toBe(servedHosts.at(-1)?.revisions);
  }, 15_000);

  /* W6.r1 finding 16 (GI-Q6): the session credential names the signed-in account, so a resume refuses another's attempt. */
  it("should forward the signed-in session's user id as the credential's principal", async () => {
    const { host, workspaceRoot } = await configuredHost();
    host.handleMessage(frame({ type: 'authToken', token: 'bearer-1', principal: 'user_1' }));
    connect(host, workspaceRoot);
    await vi.waitFor(() => {
      expect(projectHostCalls).toHaveLength(1);
    });
    const options = projectHostCalls[0]!.host();

    expect(options.credential()).toEqual({ mode: 'session', principal: 'user_1' });
    /* Read per admission: a sign-out drops it, and the next account's id replaces it. */
    host.handleMessage(frame({ type: 'authToken', token: undefined }));
    expect(options.credential()).toEqual({ mode: 'session' });
    host.handleMessage(frame({ type: 'authToken', token: 'bearer-2', principal: 'user_2' }));
    expect(options.credential()).toEqual({ mode: 'session', principal: 'user_2' });
  });

  /* W6.r1 round 3: the funded transport names the same account, read per invocation. */
  it("should give the funded transport the signed-in session's user id as its principal", async () => {
    const { host, workspaceRoot } = await configuredHost();
    host.handleMessage(frame({ type: 'authToken', token: 'bearer-1', principal: 'user_1' }));
    connect(host, workspaceRoot);
    await vi.waitFor(() => {
      expect(transportCalls).not.toHaveLength(0);
    });
    const { funding } = createTauCloudGatewayModelTransport(transportCalls.at(-1)!);
    if (funding.type !== 'funded') {
      throw new TypeError('The Tau Cloud gateway transport is always funded.');
    }

    await expect(funding.principal()).resolves.toBe('user_1');
    host.handleMessage(frame({ type: 'authToken', token: undefined }));
    await expect(funding.principal()).resolves.toBeUndefined();
  });

  it('starts no external agents when main discovered none', async () => {
    /* The honest empty list, not a refusal: a machine without the pinned
     * adapters — or without their CLIs — is simply a Tau-runs-only host. */
    const { host, workspaceRoot } = await configuredHost();
    await expect(startExternal(connect(host, workspaceRoot), 'codex')).resolves.toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/runs no acp agents/u) as unknown as string,
    });
  });

  it('wires the agents main discovered into launcher 2, and only those', async () => {
    const { host, workspaceRoot } = await configuredHost({
      externalAgents: [
        {
          id: 'claude',
          displayName: 'Claude Code',
          package: '@agentclientprotocol/claude-agent-acp',
          version: '0.70.0',
          cli: 'claude',
          configEnv: ['CLAUDE_CONFIG_DIR'],
          modulePath: '/opt/adapters/claude-agent-acp.mjs',
        },
      ],
    });
    const client = connect(host, workspaceRoot);

    /* The port's own inventory answers — a different refusal from the "runs no
     * acp agents" above, and the only way to reach it is a wired port whose
     * list is exactly what main discovered. */
    await expect(startExternal(client, 'codex')).resolves.toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/cannot start the codex agent/u) as unknown as string,
    });
  });

  it('serves its own MCP endpoint to the agents it wires (V7)', async () => {
    const { host, workspaceRoot } = await configuredHost({
      externalAgents: [
        {
          id: 'codex',
          displayName: 'Codex',
          package: '@agentclientprotocol/codex-acp',
          version: '0.5.6',
          cli: 'codex',
          configEnv: ['CODEX_HOME'],
          modulePath: '/opt/adapters/codex-acp.mjs',
        },
      ],
    });
    connect(host, workspaceRoot);

    const wired = projectHostCalls[0]?.host();
    expect(wired?.externalAgents?.agents.map(({ id }) => id)).toEqual(['codex']);
    /* The socket binds a tick after the connection is served, exactly as the
     * daemon's own URL resolves per run rather than at wiring time. */
    await expect.poll(() => wired?.externalAgents?.mcpUrl() ?? '').toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\//u);
    const mcpUrl = wired!.externalAgents!.mcpUrl();
    const [skillBundle] = wired!.systemSkillBundles ?? [];
    expect(typeof skillBundle?.slug).toBe('string');
    expect(skillBundle?.files.some(({ path }) => path === 'SKILL.md')).toBe(true);
    await vi.waitFor(() => {
      expect(servedHosts[0]?.mcp).toBeDefined();
    });
    const endpoint = servedHosts[0]!.mcp!;
    expect(endpoint.activate).toEqual(expect.any(Function));
    /* A capability, not the channel token (VI4): a distinct prefix, a distinct
     * secret, and a grant of the four CAD tools. */
    expect(endpoint.mint({ runId: 'run-1', chatId: 'chat-1' }).token).toMatch(/^tau-mcp-host-v1\./u);

    /* The listener is real and the route reaches the endpoint: an unadmitted
     * request is refused by the capability check, not by a missing route. */
    const refused = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(refused.status).toBe(401);
    const unrouted = await fetch(new URL('/mcp/elsewhere', mcpUrl));
    expect(unrouted.status).toBe(404);
  });

  it('records one finalized revision per turn on launcher 2 (V17)', async () => {
    const { host, workspaceRoot } = await configuredHost();
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    const projectId = 'proj_revision';
    const client = connect(host, workspaceRoot, projectId);

    /* The gateway is main's real URL and nothing is listening, so the turn is
       admitted and then fails. That is the point: a revision is recorded for
       every turn that *ran*, not only for one that succeeded — the writes a
       failed turn already made are exactly what would otherwise be unrecorded. */
    await client.execute({
      type: 'start',
      commandId: 'cmd-revision',
      payload: {
        trigger: 'submit',
        chatId: 'chat-revision',
        runId: 'run-revision',
        message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
        config: {
          systemPrompt: 'You are Tau.',
          toolChoice: 'auto',
          model: {
            id: 'fixture-model',
            providerKind: 'vertexai',
            contextWindow: 200_000,
          },
        },
      },
    });

    /* Read off disk rather than through the launcher: the utility keeps its
       launchers private, and the store the revision lands in is the project's
       own — the one the next window reopens. No branch is created for the chat
       (S11): the turn attaches to the live checkout and records on `main`. */
    const head = async (): Promise<string | undefined> => {
      try {
        const reference = await readFile(join(workspaceRoot, '.git', 'refs', 'heads', 'main'), 'utf8');
        return reference.trim();
      } catch {
        return undefined;
      }
    };
    await expect.poll(head, { timeout: 10_000 }).toMatch(/^[\da-f]{40}$/u);
    const finalized = async (): Promise<unknown> => {
      const result = await client.read({ chatId: 'chat-revision', cursor: 0, limit: 16, maxBytes: 1_048_576 });
      return result.status === 'batch'
        ? result.events.find(
            (event) =>
              typeof event === 'object' && event !== null && 'type' in event && event.type === 'turn.finalized',
          )
        : undefined;
    };
    await expect.poll(finalized, { timeout: 10_000 }).toMatchObject({ type: 'turn.finalized', projectId });
    const nativeHistory = await client.revision({ command: 'log', limit: 8 });
    expect(nativeHistory).toMatchObject({
      status: { projectId, line: { kind: 'branch', name: 'main' } },
      result: [expect.objectContaining({ revisionNumber: 1 })],
    });
    /* The turn held a lease while it ran and the settlement retired it, so the
       next window's open sweep finds nothing of this run. */
    const leases = async (): Promise<readonly string[]> => {
      try {
        return await readdir(join(workspaceRoot, '.tau', 'runs'));
      } catch {
        return [];
      }
    };
    await expect.poll(leases, { timeout: 10_000 }).toEqual([]);
    await expect(readdir(join(workspaceRoot, '.tau', 'workspaces'))).rejects.toThrow();
  }, 20_000);

  /* Review a1 R1: the desktop performs the early named refusal too. A packaged app
   * launched from Finder has `/usr/bin:/bin:/usr/sbin:/sbin` on PATH, and
   * Homebrew's `git-lfs` is not on it. */
  it.runIf(gitToolchainOnPath)(
    'names the binaries it is missing, and records with the ones main gives it',
    async () => {
      const unavailable: Array<{
        readonly reason: string;
        readonly missing: readonly string[];
      }> = [];
      const previousPath = process.env['PATH'] ?? '';
      process.env['PATH'] = '';
      try {
        const { host, workspaceRoot } = await configuredHost(
          {},
          {
            onRevisionsUnavailable: (_root, event) => {
              unavailable.push(event);
            },
          },
        );
        connect(host, workspaceRoot);
        await expect.poll(() => unavailable.length, { timeout: 10_000 }).toBe(1);
        expect(unavailable[0]?.missing).toEqual(['git', 'git-lfs']);
        expect(unavailable[0]?.reason).toContain('git-lfs');
        expect(existsSync(join(workspaceRoot, '.git'))).toBe(false);
      } finally {
        process.env['PATH'] = previousPath;
      }

      /* Environment names, not identifiers: assigned rather than spelled as keys. */
      const searchPath: NodeJS.ProcessEnv = {};
      searchPath['PATH'] = previousPath;
      const git = execFileSync('which', ['git'], {
        encoding: 'utf8',
        env: searchPath,
      }).trim();
      const gitLfs = execFileSync('which', ['git-lfs'], {
        encoding: 'utf8',
        env: searchPath,
      }).trim();
      /* The bundled layout OQ3 ships: one `git` whose own exec path carries
       * `git-lfs`, so `git lfs` resolves through it with nothing on `PATH` and
       * this host names a single binary. A system git has no such exec path,
       * hence the stand-in. */
      const bundleRoot = await mkdtemp(join(tmpdir(), 'tau-services-git-bundle-'));
      workspaces.push(bundleRoot);
      const bundledGit = join(bundleRoot, 'bundled-git');
      await writeFile(bundledGit, `#!/bin/sh\nPATH="${dirname(gitLfs)}"\nexport PATH\nexec "${git}" "$@"\n`);
      await chmod(bundledGit, 0o755);
      process.env['PATH'] = '';
      try {
        const bundled = await configuredHost(
          {},
          {
            gitExecutable: bundledGit,
            onRevisionsUnavailable: (_root, event) => {
              unavailable.push(event);
            },
          },
        );
        connect(bundled.host, bundled.workspaceRoot);
        await expect
          .poll(() => existsSync(join(bundled.workspaceRoot, '.git')), {
            timeout: 10_000,
          })
          .toBe(true);
        expect(unavailable).toHaveLength(1);
      } finally {
        process.env['PATH'] = previousPath;
      }
    },
    30_000,
  );

  it('leaves a direct turn to the project context main already registered', async () => {
    const runtimeContext = vi.fn();
    const { host, workspaceRoot } = await configuredHost({}, { runtimeContext });
    const client = connect(host, workspaceRoot);

    await client.execute({
      type: 'start',
      commandId: 'cmd-direct',
      payload: {
        trigger: 'submit',
        chatId: 'chat-direct',
        runId: 'run-direct',
        message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
        config: {
          systemPrompt: 'You are Tau.',
          toolChoice: 'auto',
          model: {
            id: 'fixture-model',
            providerKind: 'vertexai',
            contextWindow: 200_000,
          },
        },
      },
    });

    /* A direct turn publishes the live root under its own run id; registering
       it again would put the project's own context on a turn's lifetime. */
    expect(runtimeContext).not.toHaveBeenCalled();
  }, 20_000);

  it('refuses a root the user never granted, and closes the port', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: { workspaceRoot: '/etc' },
        },
        [port],
      ),
    );

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', {
      workspaceRoot: '/etc',
    });
    expect(port.close).toHaveBeenCalled();
  });

  it('refuses a connection that names no root at all', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'agentHost' }, [port]));

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', {
      workspaceRoot: undefined,
    });
    expect(port.close).toHaveBeenCalled();
  });

  it('should serve an agent host requested before its config arrives', async () => {
    /* Main does not await its external-agent discovery (D17), so the window
       boots beside it and asks for this port first. Refusing the early request
       closed the renderer's channel, and the page read that as a dead host. */
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    const authorityDirectory = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-authority-'));
    workspaces.push(workspaceRoot, authorityDirectory);
    const harness = hostHarness({ authorityDirectory, serve: serveNodeFsProvider });
    hosts.push(harness.host);
    harness.host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    const client = connect(harness.host, workspaceRoot);

    harness.host.handleMessage(frame({ type: 'agentHost', config }));

    await expect(attachUnwritten(client, 'chat-early')).resolves.toMatchObject(unwrittenAttach);
    expect(harness.log).not.toHaveBeenCalledWith('agent-host.not-configured', expect.anything());
  }, 20_000);

  it('should refuse an agent host whose config never arrives', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    const { host, log } = hostHarness();
    hosts.push(host);
    host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    const port = stubPort();
    vi.useFakeTimers();
    try {
      host.handleMessage(
        frame(
          {
            type: 'concern',
            concern: 'agentHost',
            context: { workspaceRoot, nativeTrustFile: '/trust/widget' },
          },
          [port],
        ),
      );

      // Still parked: main's CLI and model probes take seconds, not instants.
      await vi.advanceTimersByTimeAsync(9000);
      expect(port.close).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000);
      expect(log).toHaveBeenCalledWith('agent-host.not-configured', {
        workspaceRoot,
      });
      expect(port.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
