import { expect, it } from 'vitest';
import { CrossTabCoordinator } from '@taucad/filesystem';
import { populateBundledTypesMount } from '#machines/bundled-types-mount.js';

type HeldLock = {
  readonly acquired: Promise<void>;
  readonly done: Promise<void>;
  readonly release: () => void;
};

const heldLock = (start: (acquired: () => void, released: Promise<void>) => Promise<void>): HeldLock => {
  const acquired = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  return {
    acquired: acquired.promise,
    done: start(acquired.resolve, released.promise),
    release: released.resolve,
  };
};

const bundledTypesLock = (): HeldLock =>
  heldLock(async (acquired, released) => {
    await populateBundledTypesMount(
      {
        exists: async () => {
          acquired();
          await released;
          return false;
        },
        rmdir: async () => undefined,
        writeFiles: async () => undefined,
      },
      [{ packageName: 'web-lock-fixture', content: 'export {};\n' }],
    );
  });

const mutationLock = (path: string): HeldLock => {
  const coordinator = new CrossTabCoordinator();
  const lock = heldLock(async (acquired, released) => {
    await coordinator.withLocks([path], async () => {
      acquired();
      await released;
    });
  });
  const done = async (): Promise<void> => {
    try {
      await lock.done;
    } finally {
      coordinator.dispose();
    }
  };
  return { ...lock, done: done() };
};

const sameOriginLockManager = async (): Promise<Readonly<{ iframe: HTMLIFrameElement; locks: LockManager }>> => {
  const iframe = document.createElement('iframe');
  const loaded = Promise.withResolvers<void>();
  iframe.addEventListener(
    'load',
    () => {
      loaded.resolve();
    },
    { once: true },
  );
  iframe.src = 'about:blank';
  document.body.append(iframe);
  await loaded.promise;
  const locks = iframe.contentWindow?.navigator.locks;
  if (locks === undefined) {
    iframe.remove();
    throw new Error('Web Locks were unavailable in the same-origin iframe.');
  }
  return { iframe, locks };
};

const expectSecondContextToWait = async (name: string, first: HeldLock): Promise<void> => {
  const { iframe, locks } = await sameOriginLockManager();
  let entered = false;
  let second: Promise<void> | undefined;
  try {
    await first.acquired;
    second = locks.request(name, async () => {
      entered = true;
    });
    const snapshot = await locks.query();

    expect(snapshot.held?.map((lock) => lock.name)).toContain(name);
    expect(snapshot.pending?.map((lock) => lock.name)).toContain(name);
    expect(entered).toBe(false);

    first.release();
    await Promise.all([first.done, second]);
    expect(entered).toBe(true);
  } finally {
    first.release();
    await Promise.allSettled([first.done, ...(second === undefined ? [] : [second])]);
    iframe.remove();
  }
};

it('should serialize both production lock names across browsing contexts', async () => {
  await expectSecondContextToWait('tau-bundled-types', bundledTypesLock());

  const path = '/projects/web-lock-fixture/main.ts';
  await expectSecondContextToWait(`tau-fs-write:${path}`, mutationLock(path));
});
