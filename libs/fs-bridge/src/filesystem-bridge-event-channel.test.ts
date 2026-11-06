/**
 * One event channel per connection (charter D14), measured where it costs: at
 * the authority. However many subscribers a connection's `events()` has, a
 * committed changeset is delivered to the connection once, by production's
 * own `watch.changeSets` counter. The same subscribers on per-watch change-set
 * registrations cost one delivery each, which shows the counter moves.
 */
import { describe, expect, it, vi } from 'vitest';
import { watchByChangeSets, workerTimings } from '@taucad/filesystem';
import type { WatchEvent } from '@taucad/filesystem';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '#filesystem-bridge.js';
import type { FileSystemBridgeRootedProxy } from '#filesystem-bridge.js';
import { conformanceProjectRoot, rootedWorkspaceHandlers } from '#filesystem-bridge-rooted.test-fixture.js';

const deliveries = (): number => workerTimings.summarize(0).counters['watch.changeSets']?.total ?? 0;

/** Resolves once `count` handlers have each been called. */
const heardBy = (count: number): { readonly handler: () => void; readonly all: Promise<void> } => {
  const all = Promise.withResolvers<void>();
  let heard = 0;
  return {
    handler: () => {
      heard += 1;
      if (heard === count) {
        all.resolve();
      }
    },
    all: all.promise,
  };
};

const open = async (): Promise<{
  proxy: FileSystemBridgeRootedProxy;
  write: (path: string) => Promise<void>;
  close: () => void;
}> => {
  const { service, handlers } = await rootedWorkspaceHandlers({ 'a.ts': 'x' }, 'working-copy');
  const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(handlers));
  await proxy.ready;
  return {
    proxy,
    write: async (path) => service.writeFile(`${conformanceProjectRoot}/${path}`, 'x'),
    close: () => {
      proxy.dispose();
      service.dispose();
    },
  };
};

describe('one event channel per connection', () => {
  it('costs the authority one delivery per changeset however many subscribe', async () => {
    const { proxy, write, close } = await open();
    try {
      const heard = heardBy(3);
      const subscriptions = [proxy.events(heard.handler), proxy.events(heard.handler), proxy.events(heard.handler)];
      await Promise.all(subscriptions.map(async (subscription) => subscription.ready));
      const before = deliveries();
      await write('one.ts');
      await heard.all;
      expect(deliveries() - before).toBe(1);
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    } finally {
      close();
    }
  });

  it("serves a kernel's dependency watch and a log observer's watch from the one channel (watchByChangeSets)", async () => {
    const { proxy, write, close } = await open();
    try {
      const dependency: WatchEvent[] = [];
      const log: WatchEvent[] = [];
      const both = heardBy(2);
      const dependencyWatch = watchByChangeSets(proxy, { paths: ['agent'], recursive: true }, (event) => {
        dependency.push(event);
        both.handler();
      });
      const logWatch = watchByChangeSets(proxy, { paths: ['agent/events.jsonl'] }, (event) => {
        log.push(event);
        both.handler();
      });
      await Promise.all([dependencyWatch.ready, logWatch.ready]);
      const before = deliveries();
      await write('agent/events.jsonl');
      await both.all;
      expect(deliveries() - before).toBe(1);
      expect(dependency).toEqual([{ type: 'change', path: 'agent/events.jsonl' }]);
      expect(log).toEqual([{ type: 'change', path: 'agent/events.jsonl' }]);
      await write('docs/elsewhere.md');
      await write('agent/file-0.ts');
      await vi.waitFor(() => {
        expect(dependency).toContainEqual({ type: 'change', path: 'agent/file-0.ts' });
      });
      expect(log).toHaveLength(1);
      dependencyWatch.unsubscribe();
      logWatch.unsubscribe();
    } finally {
      close();
    }
  });

  it('costs one delivery per registration on the per-watch change-set form (self-check)', async () => {
    const { proxy, write, close } = await open();
    try {
      const heard = heardBy(3);
      const watches = [1, 2, 3].map((index) =>
        proxy.watchChangeSets(
          { paths: [''], recursive: true, includes: [`**/*${String(index)}*`, '**'] },
          heard.handler,
        ),
      );
      await Promise.all(watches.map(async (watch) => watch.ready));
      const before = deliveries();
      await write('two.ts');
      await heard.all;
      expect(deliveries() - before).toBe(3);
      for (const watch of watches) {
        watch.unsubscribe();
      }
    } finally {
      close();
    }
  });
});
