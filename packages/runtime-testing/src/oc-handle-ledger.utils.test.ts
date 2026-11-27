/* eslint-disable @typescript-eslint/naming-convention -- the fake module mirrors embind's OCCT class names. */
/* oxlint-disable new-cap -- the fake binds an OCCT-named class, as embind does. */
import { describe, expect, it } from 'vitest';
import { installHandleLedger, summarizeLeaks } from '#oc-handle-ledger.utils.js';

/** An embind-shaped module: classes share one `ClassHandle` base that owns `delete`, `clone` and `isDeleted`. */
const fakeModule = () => {
  class ClassHandle {
    public deleted = false;
    public delete(): void {
      if (this.deleted) {
        throw new Error('Object already scheduled for deletion');
      }
      this.deleted = true;
    }
    public clone(): this {
      return new (this.constructor as new () => this)();
    }
    public isDeleted(): boolean {
      return this.deleted;
    }
  }
  class gp_Pnt extends ClassHandle {
    public static origin(): gp_Pnt {
      return new gp_Pnt();
    }
    public mirrored(): gp_Pnt {
      return new gp_Pnt();
    }
    public pair(): gp_Pnt[] {
      return [new gp_Pnt(), new gp_Pnt()];
    }
    public x(): number {
      return 0;
    }
  }
  Object.assign(gp_Pnt.origin, { overloadTable: { 1: 'one' } });
  // Embind can bind one class under two names; it is wrapped once.
  return { gp_Pnt, gp_Pnt_2: gp_Pnt, notAClass: 1 };
};

describe('installHandleLedger', () => {
  it('records handles from constructors, methods, statics and clones, and forgets deleted ones', () => {
    const module = fakeModule();
    const ledger = installHandleLedger(module);
    expect(installHandleLedger(module)).toBe(ledger);

    const before = ledger.snapshot();
    const point = new module.gp_Pnt();
    const mirrored = point.mirrored();
    const [left, right] = point.pair();
    const fromStatic = module.gp_Pnt.origin();
    const copy = point.clone();
    expect(point.x()).toBe(0);
    expect(ledger.stats()).toStrictEqual({ created: 6, deleted: 0, live: 6, doubleDeletes: 0 });
    expect(ledger.since(before).map(({ via }) => via)).toStrictEqual([
      'new gp_Pnt',
      'gp_Pnt.mirrored',
      'gp_Pnt.pair',
      'gp_Pnt.pair',
      'gp_Pnt::origin',
      'clone',
    ]);
    expect(ledger.since(before)[0]!.site).toContain('oc-handle-ledger.utils.test.ts');
    expect(ledger.since(before)[0]!.stack).toContain('oc-handle-ledger.utils.test.ts');

    for (const handle of [point, mirrored, left!, right!, fromStatic]) {
      handle.delete();
    }
    expect(() => {
      copy.delete();
      copy.delete();
    }).toThrow('already scheduled');
    expect(ledger.stats()).toStrictEqual({ created: 6, deleted: 6, live: 0, doubleDeletes: 1 });
  });

  it('keeps an embind overload table reachable through the wrapped static', () => {
    const module = fakeModule();
    const original = module.gp_Pnt.origin as unknown as { overloadTable: unknown };
    installHandleLedger(module);
    const wrapped = module.gp_Pnt.origin as unknown as { overloadTable: unknown };
    expect(wrapped).not.toBe(original);
    expect(wrapped.overloadTable).toStrictEqual({ 1: 'one' });
    wrapped.overloadTable = { 2: 'two' };
    expect(original.overloadTable).toStrictEqual({ 2: 'two' });
  });

  it('refuses a module without an embind class', () => {
    expect(() => installHandleLedger({ value: 1 })).toThrow('binds no embind class');
  });
});

describe('summarizeLeaks', () => {
  it('groups leaks by site, most frequent first', () => {
    expect(
      summarizeLeaks([
        { className: 'A', via: 'new A', site: 'b.ts:1', stack: 'b.ts:1' },
        { className: 'B', via: 'new B', site: 'a.ts:1', stack: 'a.ts:1' },
        { className: 'A', via: 'new A', site: 'b.ts:1', stack: 'b.ts:1' },
        { className: 'C', via: 'new C', site: 'a.ts:2', stack: 'a.ts:2' },
      ]),
    ).toStrictEqual([
      { key: 'new A @ b.ts:1', count: 2 },
      { key: 'new B @ a.ts:1', count: 1 },
      { key: 'new C @ a.ts:2', count: 1 },
    ]);
  });
});
