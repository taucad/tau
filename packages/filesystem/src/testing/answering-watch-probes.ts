import { readdirSync } from 'node:fs';
import path from 'node:path';
import type parcelWatcher from '@parcel/watcher';

type NativeSubscribe = typeof parcelWatcher.subscribe;

/** The name a Windows `NodeFsProvider` watch gives the probe it waits to see through its native watcher. */
const watchProbeName = /^\.tau-watch-probe\.\d+\.[\da-f-]{36}\.tmp$/u;

/**
 * Wrap a stand-in for `@parcel/watcher`'s `subscribe` so that it reports each
 * watch probe written into its directory, as the native watcher does. On
 * Windows a `NodeFsProvider` watch is admitted only once its probe came back;
 * a stand-in that never reports one would hold every admission for the whole
 * probe budget. Elsewhere no probe is written and this reports nothing.
 *
 * @param subscribe - The stand-in.
 * @returns The stand-in, answering probes until its subscription is closed.
 */
export const answeringWatchProbes =
  (subscribe: NativeSubscribe): NativeSubscribe =>
  async (directory, callback, options) => {
    const subscription = await subscribe(directory, callback, options);
    const answered = new Set<string>();
    const timer = setInterval(() => {
      let names: string[];
      try {
        names = readdirSync(directory);
      } catch {
        return;
      }
      const probes = names
        .filter((name) => watchProbeName.test(name))
        .map((name) => path.join(directory, name))
        .filter((probe) => !answered.has(probe));
      if (probes.length === 0) {
        return;
      }
      for (const probe of probes) {
        answered.add(probe);
      }
      callback(
        null,
        probes.map((probe) => ({ path: probe, type: 'create' })),
      );
    }, 5);
    timer.unref();
    return {
      unsubscribe: async () => {
        clearInterval(timer);
        await subscription.unsubscribe();
      },
    };
  };
