// @vitest-environment node
/**
 * The resident worker's project-host registry (RH-R4, I31; W6.r1 findings 4 and 8): a failed open keeps the previous
 * host, a release closes only the incarnation it names, and a rebridge never opens or closes a host.
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { AgentHostProjectProvide, AgentHostProjectRebridge } from '#workers/agent-host.contract.js';
import { createDisposers, createProjectHosts } from '#workers/agent-host-projects.js';
import type { ProjectHostIncarnation } from '#workers/agent-host-projects.js';

type FakeHost = ProjectHostIncarnation & {
  readonly close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly drain: ReturnType<typeof vi.fn<(signal: AbortSignal) => Promise<void>>>;
  readonly rebridge: ReturnType<typeof vi.fn<(ports: AgentHostProjectRebridge) => Promise<void>>>;
};

/* No ports: a deep mock would answer each with a stand-in that is not a port. */
const provideOf = (hostId: string): AgentHostProjectProvide =>
  mock<AgentHostProjectProvide>({
    projectId: 'project-1',
    hostId,
    fileSystemPort: undefined,
    projectRootPort: undefined,
    computeStorePort: undefined,
    revisionsPort: undefined,
    placementPort: undefined,
  });

const rebridgeOf = (hostId: string): AgentHostProjectRebridge => {
  const fileSystem = new MessageChannel();
  const projectRoot = new MessageChannel();
  return { projectId: 'project-1', hostId, fileSystemPort: fileSystem.port1, projectRootPort: projectRoot.port1 };
};

/**
 * A registry whose opens are held until the test settles them, one at a time, in order. A host's drain ends when
 * `drained` resolves, or on its signal.
 */
const registry = (options?: Parameters<typeof createProjectHosts>[1]) => {
  const opened: FakeHost[] = [];
  const pending: Array<PromiseWithResolvers<void>> = [];
  const drained = Promise.withResolvers<void>();
  const hosts = createProjectHosts<FakeHost>(async (args) => {
    const gate = Promise.withResolvers<void>();
    pending.push(gate);
    await gate.promise;
    const host: FakeHost = {
      hostId: args.hostId,
      close: vi.fn(async () => undefined),
      rebridge: vi.fn(async () => undefined),
      drain: vi.fn(async (signal: AbortSignal) => {
        const aborted = Promise.withResolvers<void>();
        signal.addEventListener('abort', () => {
          aborted.resolve();
        });
        await Promise.race([drained.promise, aborted.promise]);
      }),
    };
    opened.push(host);
    return host;
  }, options);
  const settleOpen = async (outcome: 'open' | 'fail'): Promise<void> => {
    await vi.waitFor(() => {
      expect(pending.length).toBeGreaterThan(0);
    });
    const gate = pending.shift();
    if (outcome === 'open') {
      gate?.resolve();
    } else {
      gate?.reject(Object.assign(new Error('The host did not open.'), { code: 'STORAGE_NOT_WRITABLE' }));
    }
  };
  return { hosts, opened, settleOpen, drained };
};

describe('createProjectHosts', () => {
  it('should keep the previous host registered and open when a new host fails to open', async () => {
    const { hosts, opened, settleOpen } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await expect(first).resolves.toEqual({});

    const second = hosts.provide(provideOf('host-2'));
    await settleOpen('fail');

    await expect(second).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
    expect(hosts.hostOf('project-1')?.hostId).toBe('host-1');
    expect(opened[0]?.close).not.toHaveBeenCalled();
  });

  /* W6.r1 round 3: a provide whose host fails to open closes every port it transferred. */
  it('should close every transferred port when the host fails to open', async () => {
    const { hosts, settleOpen } = registry();
    const channels = [new MessageChannel(), new MessageChannel(), new MessageChannel(), new MessageChannel()];
    const closes = channels.map(({ port1 }) => vi.spyOn(port1, 'close'));
    const provide = hosts.provide({
      ...provideOf('host-1'),
      fileSystemPort: channels[0]!.port1,
      projectRootPort: channels[1]!.port1,
      revisionsPort: channels[2]!.port1,
      placementPort: channels[3]!.port1,
    });
    await settleOpen('fail');

    await expect(provide).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
    expect(closes.map((close) => close.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('should replace hosts provided concurrently in order and close every replaced one', async () => {
    const { hosts, opened, settleOpen } = registry();
    const first = hosts.provide(provideOf('host-1'));
    const second = hosts.provide(provideOf('host-2'));
    await settleOpen('open');
    await settleOpen('open');

    await expect(first).resolves.toEqual({});
    await expect(second).resolves.toEqual({ replaced: 'host-1' });
    expect(hosts.hostOf('project-1')?.hostId).toBe('host-2');
    expect(opened.map((host) => host.drain.mock.calls.length)).toEqual([1, 0]);
  });

  it('should close nothing registered on a release that names a replaced incarnation', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    const second = hosts.provide(provideOf('host-2'));
    await settleOpen('open');
    await second;
    drained.resolve();

    await hosts.release({ projectId: 'project-1', hostId: 'host-1' });

    expect(hosts.hostOf('project-1')?.hostId).toBe('host-2');
    expect(opened[1]?.close).not.toHaveBeenCalled();
  });

  it('should close and unregister the host a release names', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    drained.resolve();

    await hosts.release({ projectId: 'project-1', hostId: 'host-1' });

    expect(hosts.hostOf('project-1')).toBeUndefined();
    expect(opened[0]?.close).toHaveBeenCalledOnce();
  });

  /* T3: the last client's release never stops a live run; the host drains, then closes. */
  it('should close a released host only once its runs drain, and open a provide meanwhile at once', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;

    let released = false;
    const releasing = (async (): Promise<void> => {
      await hosts.release({ projectId: 'project-1', hostId: 'host-1' });
      released = true;
    })();
    await vi.waitFor(() => {
      expect(opened[0]?.drain).toHaveBeenCalledOnce();
    });
    const second = hosts.provide(provideOf('host-2'));
    await settleOpen('open');

    await expect(second).resolves.toEqual({});
    expect(hosts.hostOf('project-1')?.hostId).toBe('host-2');
    expect(opened[0]?.close).not.toHaveBeenCalled();
    expect(released).toBe(false);

    drained.resolve();
    await releasing;
    expect(opened[0]?.close).toHaveBeenCalledOnce();
    expect(opened[1]?.close).not.toHaveBeenCalled();
  });

  /* T3: a replaced host drains like a released one; the page's release of it answers once it closed. */
  it('should drain a replaced host, and answer its release once it closed', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    const second = hosts.provide(provideOf('host-2'));
    await settleOpen('open');

    await expect(second).resolves.toEqual({ replaced: 'host-1' });
    expect(opened[0]?.drain).toHaveBeenCalledOnce();
    expect(opened[0]?.close).not.toHaveBeenCalled();
    let released = false;
    const releasing = (async (): Promise<void> => {
      await hosts.release({ projectId: 'project-1', hostId: 'host-1' });
      released = true;
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(released).toBe(false);

    drained.resolve();
    await releasing;
    expect(opened[0]?.close).toHaveBeenCalledOnce();
    expect(hosts.hostOf('project-1')?.hostId).toBe('host-2');
  });

  /* W6.r1 round 3: a file-manager restart during a drain gives the draining host fresh bridges too. */
  it('should rebridge a released host while it drains, and refuse once it closed', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    const releasing = hosts.release({ projectId: 'project-1', hostId: 'host-1' });
    const ports = rebridgeOf('host-1');

    await expect(hosts.rebridge(ports)).resolves.toEqual({ status: 'rebridged' });
    expect(opened[0]?.rebridge).toHaveBeenCalledExactlyOnceWith(ports);

    drained.resolve();
    await releasing;
    /* RH-A26: bridges for an incarnation no longer open are closed, never handed to a host. */
    const late = rebridgeOf('host-1');
    const closes = [vi.spyOn(late.fileSystemPort, 'close'), vi.spyOn(late.projectRootPort, 'close')];
    await expect(hosts.rebridge(late)).resolves.toEqual({ status: 'needs' });
    expect(closes.map((close) => close.mock.calls.length)).toEqual([1, 1]);
  });

  /* W6.r1 round 4: a rebridge under way when the drain ends finishes first, so the close disposes what it swapped in;
   * one that comes after the close began is answered `needs` with its ports closed. */
  it('should close a draining host only after a rebridge under way, and refuse one once the close began', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    const releasing = hosts.release({ projectId: 'project-1', hostId: 'host-1' });
    const swapped = Promise.withResolvers<void>();
    opened[0]!.rebridge.mockImplementationOnce(async () => swapped.promise);
    const rebridging = hosts.rebridge(rebridgeOf('host-1'));
    await vi.waitFor(() => {
      expect(opened[0]?.rebridge).toHaveBeenCalledOnce();
    });

    drained.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(opened[0]?.close).not.toHaveBeenCalled();
    const late = rebridgeOf('host-1');
    const closes = [vi.spyOn(late.fileSystemPort, 'close'), vi.spyOn(late.projectRootPort, 'close')];
    const refused = hosts.rebridge(late);
    swapped.resolve();

    await expect(rebridging).resolves.toEqual({ status: 'rebridged' });
    await releasing;
    expect(opened[0]?.close).toHaveBeenCalledOnce();
    await expect(refused).resolves.toEqual({ status: 'needs' });
    expect(closes.map((close) => close.mock.calls.length)).toEqual([1, 1]);
  });

  /* W6.r1 round 3: a composition that fails part-way closes what it opened, newest first, whatever one close throws. */
  it('should dispose newest first and keep going past a disposer that throws', async () => {
    const order: string[] = [];
    const reported: unknown[] = [];
    const disposers = createDisposers((error) => {
      reported.push(error);
    });
    disposers.push(() => {
      order.push('bridges');
    });
    disposers.push(async () => {
      order.push('runtime');
      throw new Error('runtime did not stop');
    });
    disposers.push(() => {
      order.push('revisions');
    });

    await disposers.disposeAll();
    await disposers.disposeAll();

    expect(order).toEqual(['revisions', 'runtime', 'bridges']);
    expect(reported).toEqual([new Error('runtime did not stop')]);
  });

  it('should close a released host at the drain bound when its runs do not settle', async () => {
    const { hosts, opened, settleOpen } = registry({ drainBound: 20 });
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;

    await hosts.release({ projectId: 'project-1', hostId: 'host-1' });

    expect(opened[0]?.drain).toHaveBeenCalledOnce();
    expect(opened[0]?.close).toHaveBeenCalledOnce();
  });

  it('should swap bridges into the named host and refuse a rebridge for a closed one without opening it', async () => {
    const { hosts, opened, settleOpen, drained } = registry();
    const first = hosts.provide(provideOf('host-1'));
    await settleOpen('open');
    await first;
    drained.resolve();
    const ports = rebridgeOf('host-1');

    await expect(hosts.rebridge(ports)).resolves.toEqual({ status: 'rebridged' });
    expect(opened[0]?.rebridge).toHaveBeenCalledExactlyOnceWith(ports);
    expect(opened[0]?.close).not.toHaveBeenCalled();

    await hosts.release({ projectId: 'project-1', hostId: 'host-1' });
    await expect(hosts.rebridge(rebridgeOf('host-1'))).resolves.toEqual({ status: 'needs' });
    expect(hosts.hostOf('project-1')).toBeUndefined();
    expect(opened).toHaveLength(1);
  });
});
