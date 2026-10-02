import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { admitKernelOptions } from '#framework/kernel-option-admission.js';

describe('kernel option admission', () => {
  it('should reject options without a schema and stripped nested fields', () => {
    expect(
      admitKernelOptions(undefined, { extra: true }, 'Kernel k evaluate', 'EVALUATE_OPTIONS_INVALID'),
    ).toMatchObject({
      success: false,
      issues: [{ code: 'EVALUATE_OPTIONS_INVALID', message: expect.stringContaining('extra') as string }],
    });
    expect(
      admitKernelOptions(
        z.object({ nested: z.object({ valid: z.string() }) }),
        { nested: { valid: 'yes', extra: true } },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ code: 'VIEW_OPTIONS_INVALID', message: expect.stringContaining('nested.extra') as string }],
    });
  });

  it('should apply defaults and transforms once and accept explicit loose objects', () => {
    const schema = z.object({ size: z.string().default('2').transform(Number) });
    expect(admitKernelOptions(schema, {}, 'Kernel k export e', 'EXPORT_OPTIONS_INVALID')).toEqual({
      success: true,
      options: { size: 2 },
    });
    expect(admitKernelOptions(z.looseObject({}), { extra: true }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toEqual({
      success: true,
      options: { extra: true },
    });
  });

  it('should locate errors in every union branch', () => {
    const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);
    const result = admitKernelOptions(schema, { a: 1, b: 'bad' }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.message).join('\n')).toMatch(/branch 1.*a/);
      expect(result.issues.map((issue) => issue.message).join('\n')).toMatch(/branch 2.*b/);
    }
  });

  it('should check nested record and intersection fields without rejecting retained sibling keys', () => {
    const schema = z.object({
      rows: z.record(z.string(), z.object({ valid: z.string() })),
      joined: z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() })),
    });
    expect(
      admitKernelOptions(
        schema,
        {
          rows: { first: { valid: 'yes', extra: true } },
          joined: { a: 'a', b: 'b' },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ message: expect.stringContaining('rows.first.extra') as string }],
    });
    expect(
      admitKernelOptions(
        schema,
        {
          rows: { first: { valid: 'yes' } },
          joined: { a: 'a', b: 'b' },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: true });
  });

  it('should run a union transform only once and allow its declared input key to disappear', () => {
    let calls = 0;
    const schema = z.union([
      z.object({ a: z.string() }).transform(({ a }) => {
        calls += 1;
        return { renamed: a };
      }),
      z.object({ b: z.number() }),
    ]);
    expect(admitKernelOptions(schema, { a: 'ok' }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toEqual({
      success: true,
      options: { renamed: 'ok' },
    });
    expect(calls).toBe(1);
  });

  it('should reject a field stripped by the selected union branch', () => {
    const variant = z.union([
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.object({ kind: z.literal('b'), extra: z.number() }),
    ]);
    expect(
      admitKernelOptions(variant, { kind: 'a', a: 1, extra: 2 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('extra') as string }] });
    expect(
      admitKernelOptions(
        z.object({ variant }),
        {
          variant: { kind: 'a', a: 1, extra: 2 },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ message: expect.stringContaining('variant.extra') as string }],
    });
    const inactiveTransform = z.union([
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.object({ kind: z.literal('b'), extra: z.number() }).transform((value) => value),
    ]);
    expect(
      admitKernelOptions(inactiveTransform, { kind: 'a', a: 1, extra: 2 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('extra') as string }] });
    const refined = z.object({
      items: z.array(
        z.union([
          z
            .object({ value: z.string() })
            .refine(({ value }) => value.startsWith('a'))
            .transform(({ value }) => ({ picked: value })),
          z
            .object({ value: z.string(), extra: z.string() })
            .refine(({ value }) => value.startsWith('b'))
            .transform(({ value }) => ({ picked: value })),
        ]),
      ),
    });
    expect(
      admitKernelOptions(
        refined,
        { items: [{ value: 'alpha', extra: 'stripped' }] },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('items[0].extra') as string }] });
    expect(
      admitKernelOptions(
        refined,
        { items: [{ value: 'alpha' }, { value: 'beta', extra: 'kept' }] },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: true });
  });

  it('should track reused unions, scalar unions and object catchall unions', () => {
    const shared = z.union([
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.object({ kind: z.literal('b'), b: z.number() }),
    ]);
    const schema = z.object({
      first: shared,
      second: shared,
      mode: z.union([z.literal('x'), z.literal('y')]),
      dynamic: z.object({}).catchall(shared),
    });
    expect(
      admitKernelOptions(
        schema,
        {
          first: { kind: 'a', a: 1 },
          second: { kind: 'b', b: 2 },
          mode: 'x',
          dynamic: { item: { kind: 'a', a: 3 } },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: true });
    expect(
      admitKernelOptions(
        schema,
        {
          first: { kind: 'a', a: 1 },
          second: { kind: 'b', b: 2, a: 3 },
          mode: 'y',
          dynamic: { item: { kind: 'a', a: 3 } },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ message: expect.stringContaining('second.a') as string }],
    });
    expect(
      admitKernelOptions(
        schema,
        {
          first: { kind: 'a', a: 1 },
          second: { kind: 'b', b: 2 },
          mode: 'y',
          dynamic: { item: { kind: 'a', a: 3, b: 4 } },
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ message: expect.stringContaining('dynamic.item.b') as string }],
    });
  });

  it('should keep selected union ownership through an intersection', () => {
    const schema = z.intersection(
      z.union([
        z.object({ kind: z.literal('a'), payload: z.object({ x: z.number() }) }),
        z.object({ kind: z.literal('b'), payload: z.object({ x: z.number(), extra: z.number() }) }),
      ]),
      z.object({ common: z.string() }),
    );
    expect(
      admitKernelOptions(
        schema,
        {
          kind: 'a',
          payload: { x: 1, extra: 2 },
          common: 'ok',
        },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({
      success: false,
      issues: [{ message: expect.stringContaining('payload.extra') as string }],
    });
  });

  it('should check nested unknowns beneath a deliberately renamed parent', () => {
    const schema = z
      .object({ nested: z.object({ valid: z.string() }) })
      .transform(({ nested }) => ({ value: nested.valid }));
    expect(admitKernelOptions(schema, { nested: { valid: 'ok' } }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toEqual({
      success: true,
      options: { value: 'ok' },
    });
    expect(
      admitKernelOptions(schema, { nested: { valid: 'ok', extra: true } }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('nested.extra') as string }] });
  });

  it('should preserve discriminated union admission and selected-branch stripping', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.object({ kind: z.literal('b'), b: z.number() }),
    ]);
    expect(admitKernelOptions(schema, { kind: 'a', a: 1 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toMatchObject({
      success: true,
      options: { kind: 'a', a: 1 },
    });
    expect(
      admitKernelOptions(schema, { kind: 'a', a: 1, b: 2 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('b') as string }] });
    const nested = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), a: z.number() }),
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('b'), b: z.number() }),
        z.object({ kind: z.literal('c'), c: z.number() }),
      ]),
    ]);
    const originalOuterRun = nested._zod.run;
    const originalLeafRun = nested.options[0]._zod.run;
    expect(admitKernelOptions(nested, { kind: 'b', b: 1 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toMatchObject({
      success: true,
      options: { kind: 'b', b: 1 },
    });
    expect(
      admitKernelOptions(nested, { kind: 'b', b: 1, c: 2 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('c') as string }] });
    expect(admitKernelOptions(nested, { kind: 'c', c: 1 }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID')).toMatchObject({
      success: true,
    });
    expect(nested._zod.run).toBe(originalOuterRun);
    expect(nested.options[0]._zod.run).toBe(originalLeafRun);
  });

  it('should inspect fixed and rest tuple elements for stripped fields', () => {
    const schema = z.object({ rows: z.tuple([z.object({ valid: z.string() })]).rest(z.object({ valid: z.string() })) });
    expect(
      admitKernelOptions(
        schema,
        { rows: [{ valid: 'ok' }, { valid: 'also' }] },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: true });
    expect(
      admitKernelOptions(schema, { rows: [{ valid: 'ok', extra: true }] }, 'Kernel k view v', 'VIEW_OPTIONS_INVALID'),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('rows[0].extra') as string }] });
    expect(
      admitKernelOptions(
        schema,
        { rows: [{ valid: 'ok' }, { valid: 'also', extra: true }] },
        'Kernel k view v',
        'VIEW_OPTIONS_INVALID',
      ),
    ).toMatchObject({ success: false, issues: [{ message: expect.stringContaining('rows[1].extra') as string }] });
  });
});
