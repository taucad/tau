import { assertType, describe, expect, expectTypeOf, it } from 'vitest';
import { isKernelIssueCode, kernelIssueCodeValues } from '#types/kernel-issue-codes.js';
import type { KernelIssueCode } from '#types/index.js';
import type { KernelIssue } from '#types/runtime.types.js';

describe('KernelIssueCode', () => {
  it('is derived from the canonical generic issue-code registry', () => {
    const legacyGeometryCode = `JSCAD_${'GEOMETRY'}_INVALID` as const;
    const legacyMissingNameCode = `JSCAD_${'PART'}_NAME_MISSING` as const;
    const removedMissingNameCode = `GEOMETRY_${'PART'}_NAME_MISSING` as const;

    expectTypeOf<KernelIssueCode>().toEqualTypeOf<(typeof kernelIssueCodeValues)[number]>();
    expect(kernelIssueCodeValues).toContain('GEOMETRY_INVALID');
    assertType<KernelIssueCode>('GEOMETRY_INVALID');

    // @ts-expect-error -- unnamed geometry parts use deterministic fallback names and do not emit an issue code.
    assertType<KernelIssueCode>(removedMissingNameCode);

    // @ts-expect-error -- kernel-prefixed Tau issue codes are not part of the public runtime union.
    assertType<KernelIssueCode>(legacyGeometryCode);

    const invalidIssue: KernelIssue = {
      // @ts-expect-error -- authoring kernel-specific codes at source is structurally rejected.
      code: legacyMissingNameCode,
      message: 'bad code',
      severity: 'warning',
    };
    void invalidIssue;
  });

  it('narrows unknown values through the public validator', () => {
    const code: unknown = 'GEOMETRY_INVALID';
    if (isKernelIssueCode(code)) {
      expectTypeOf(code).toEqualTypeOf<KernelIssueCode>();
    }
  });
});
