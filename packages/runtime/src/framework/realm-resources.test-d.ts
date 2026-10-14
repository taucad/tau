import { describe, expectTypeOf, it } from 'vitest';
import { createRealmGroup } from '#plugins/kernel-plugin-entry.js';
import type {
  KernelServices,
  RealmGroup,
  RealmHold,
  RealmHoldInput,
  RealmResources,
} from '#plugins/kernel-plugin-entry.js';

declare const services: KernelServices;

type Heap = { heap: Uint8Array<ArrayBuffer> };
type Engine = { version: string; tessellate(shape: number): Float32Array };

const heapGroup = createRealmGroup<Heap>('test-heap');
const engineGroup = createRealmGroup<Engine>('test-engine');
declare const loadEngine: () => Promise<Engine>;

describe('services.realm', () => {
  it('exposes the realm resource seam on kernel services', () => {
    expectTypeOf(services.realm).toEqualTypeOf<RealmResources>();
    expectTypeOf(services.realm.hold<Heap>)
      .parameter(0)
      .toEqualTypeOf<RealmHoldInput<Heap>>();
  });

  it('declares a group whose token fixes the value type', () => {
    expectTypeOf(heapGroup).toEqualTypeOf<RealmGroup<Heap>>();
    expectTypeOf(heapGroup.name).toEqualTypeOf<string>();
  });

  it('infers the held value from the token and types dispose with it', async () => {
    const hold = await services.realm.hold({
      group: heapGroup,
      key: 'single:',
      create: async () => ({ heap: new Uint8Array(1) }),
      dispose: (value) => {
        expectTypeOf(value).toEqualTypeOf<Heap>();
      },
    });

    expectTypeOf(hold).toEqualTypeOf<RealmHold<Heap>>();
    expectTypeOf(hold.value).toEqualTypeOf<Heap>();
    expectTypeOf(hold.release).toEqualTypeOf<() => void>();
  });

  it('keeps tokens of different value types apart', () => {
    expectTypeOf<RealmGroup<Heap>>().not.toExtend<RealmGroup<Engine>>();
    expectTypeOf<RealmGroup<Engine>>().not.toExtend<RealmGroup<Heap>>();
    expectTypeOf<RealmGroup<string>>().not.toExtend<RealmGroup<'literal'>>();
    expectTypeOf<RealmGroup<'literal'>>().not.toExtend<RealmGroup<string>>();
  });

  it('rejects a string group', async () => {
    await services.realm.hold({
      // @ts-expect-error -- a bare string is not a group: declare the backend once with createRealmGroup.
      group: 'test-heap',
      key: 'single:',
      create: async () => ({ heap: new Uint8Array(1) }),
    });
  });

  it('rejects a create of another type than the token', async () => {
    // @ts-expect-error -- the token fixes the value: an engine is not a heap.
    await services.realm.hold({ group: heapGroup, key: 'single:', create: loadEngine });
  });

  it('rejects a dispose that uses the value as another type', async () => {
    await services.realm.hold({
      group: heapGroup,
      key: 'single:',
      create: async () => ({ heap: new Uint8Array(1) }),
      dispose: (value) => {
        // @ts-expect-error -- dispose receives the token's value: a heap has no `tessellate`.
        value.tessellate(0);
      },
    });
  });

  it('rejects an explicit type argument that disagrees with the token', async () => {
    // @ts-expect-error -- an explicit type argument cannot disagree with the token.
    await services.realm.hold<Engine>({ group: heapGroup, key: 'single:', create: loadEngine });
    const engine = await services.realm.hold<Engine>({ group: engineGroup, key: 'single:', create: loadEngine });
    expectTypeOf(engine.value).toEqualTypeOf<Engine>();
  });

  it('holds unknown through an unannotated token', async () => {
    const untyped = createRealmGroup('test-untyped');
    expectTypeOf(untyped).toEqualTypeOf<RealmGroup<unknown>>();

    const hold = await services.realm.hold({ group: untyped, key: 'single:', create: async () => 1 });
    expectTypeOf(hold.value).toEqualTypeOf<unknown>();
  });

  it('rejects a hold without create, a missing key or a synchronous create', async () => {
    // @ts-expect-error -- a realm resource needs its creator.
    await services.realm.hold({ group: heapGroup, key: 'single:' });

    // @ts-expect-error -- the build key identifies the held instance and is required.
    await services.realm.hold({ group: heapGroup, create: async () => ({ heap: new Uint8Array(1) }) });

    // @ts-expect-error -- creation is asynchronous so concurrent holders can share one pending value.
    await services.realm.hold({ group: heapGroup, key: 'single:', create: () => ({ heap: new Uint8Array(1) }) });
  });

  it('keeps the held value read-only', async () => {
    const hold = await services.realm.hold({
      group: heapGroup,
      key: 'k',
      create: async () => ({ heap: new Uint8Array(1) }),
    });
    // @ts-expect-error -- holders share one value and cannot replace it.
    hold.value = { heap: new Uint8Array(2) };
  });
});
