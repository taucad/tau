import { describe, expect, it } from 'vitest';

import { kinematicsUnitStatusOf } from '#app/sources/kinematics-source.js';

describe('kinematicsUnitStatusOf', () => {
  it("should report the server's build and the kernel's mechanism issue for the shown source only", () => {
    const entry = {
      building: true,
      issues: [
        { message: 'Unrelated.', code: 'RESOURCE_LIMIT', severity: 'warning' },
        {
          message: 'Coupling names joint "gone".',
          code: 'INVALID_REFERENCE',
          severity: 'warning',
          details: { mechanism: { path: '/couplings/0' } },
        },
      ],
    } as const;
    const status = { 'main.ts': entry };

    expect(kinematicsUnitStatusOf(status, 'main.ts')).toEqual({
      isUpdating: true,
      mechanismIssue: { message: 'Coupling names joint "gone".' },
    });
    expect(kinematicsUnitStatusOf(status, 'other.ts')).toEqual({ isUpdating: false, mechanismIssue: undefined });
    expect(kinematicsUnitStatusOf(undefined, 'main.ts')).toEqual({ isUpdating: false, mechanismIssue: undefined });
    expect(kinematicsUnitStatusOf({ 'main.ts': { building: false, issues: [] } }, 'main.ts')).toEqual({
      isUpdating: false,
      mechanismIssue: undefined,
    });
  });
});
