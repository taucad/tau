import { describe, expectTypeOf, it } from 'vitest';
import type { KernelServices, RealmHold, RealmResources } from '#plugins/kernel-plugin-entry.js';

declare const services: KernelServices;

describe('services.realm', () => {
  it('exposes the realm resource seam on kernel services', () => {
    expectTypeOf(services.realm).toEqualTypeOf<RealmResources>();
  });

  it('infers the held value from create and types dispose with it', async () => {
    const hold = await services.realm.hold({
      group: 'replicad-occt',
      key: 'single:',
      create: async () => ({ heap: new Uint8Array(1) }),
      dispose: (value) => {
        expectTypeOf(value).toEqualTypeOf<{ heap: Uint8Array<ArrayBuffer> }>();
      },
    });

    expectTypeOf(hold).toEqualTypeOf<RealmHold<{ heap: Uint8Array<ArrayBuffer> }>>();
    expectTypeOf(hold.value).toEqualTypeOf<{ heap: Uint8Array<ArrayBuffer> }>();
    expectTypeOf(hold.release).toEqualTypeOf<() => void>();
  });

  it('rejects a hold without create, a missing key or a synchronous create', async () => {
    // @ts-expect-error -- a realm resource needs its creator.
    await services.realm.hold({ group: 'replicad-occt', key: 'single:' });

    // @ts-expect-error -- the build key identifies the held instance and is required.
    await services.realm.hold({ group: 'replicad-occt', create: async () => 1 });

    // @ts-expect-error -- creation is asynchronous so concurrent holders can share one pending value.
    await services.realm.hold({ group: 'replicad-occt', key: 'single:', create: () => 1 });
  });

  it('keeps the held value read-only', async () => {
    const hold = await services.realm.hold({ group: 'g', key: 'k', create: async () => 1 });
    // @ts-expect-error -- holders share one value and cannot replace it.
    hold.value = 2;
  });
});
