import { describe, expectTypeOf, it } from 'vitest';
import type { PackageIssueCode } from '@taucad/bundler-core';
import type { packageIssueCodes } from '#schemas/tools/install-packages.tool.schema.js';

/* The transcript validates persisted outputs against this list, so a code the
 * bundler reports but the schema lacks would fail every chat that recorded it. */
describe('install_packages issue contract', () => {
  it('should list every package issue code the bundler reports', () => {
    expectTypeOf<(typeof packageIssueCodes)[number]>().toEqualTypeOf<PackageIssueCode>();
  });
});
