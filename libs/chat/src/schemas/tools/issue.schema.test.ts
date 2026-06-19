import { kernelIssueCodeValues } from '@taucad/runtime/types';
import { describe, expect, it } from 'vitest';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { getKernelResultOutputSchema } from '#schemas/tools/get-kernel-result.tool.schema.js';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';

const geometryInvalidIssue = {
  message: "JSCAD part 'Planet Carrier' is not a closed oriented solid.",
  code: 'GEOMETRY_INVALID',
  severity: 'warning',
  type: 'kernel',
  details: {
    producer: { kernelId: 'jscad', validator: 'geom3.validate' },
    geometry: {
      partName: 'Planet Carrier',
      topology: { openBoundaryEdges: 236 },
      hints: ['Prefer 2D profile composition followed by one extrusion for this prismatic part.'],
    },
  },
} as const;

describe('kernelIssueSchema', () => {
  it('should accept every runtime kernel issue code', () => {
    for (const code of kernelIssueCodeValues) {
      expect(
        kernelIssueSchema.safeParse({
          code,
          message: `${code} message`,
          severity: 'warning',
        }).success,
        `expected chat schema to accept runtime code ${code}`,
      ).toBe(true);
    }
  });

  it('should reject stale kernel-prefixed geometry issue codes', () => {
    const legacyGeometryCode = `JSCAD_${'GEOMETRY'}_INVALID`;

    expect(
      kernelIssueSchema.safeParse({
        code: legacyGeometryCode,
        message: 'legacy code',
        severity: 'warning',
      }).success,
    ).toBe(false);
  });

  it('should preserve runtime-owned diagnostic details and stack frame context', () => {
    const parsed = kernelIssueSchema.parse({
      ...geometryInvalidIssue,
      stackFrames: [
        {
          fileName: 'main.jscad',
          functionName: 'main',
          lineNumber: 12,
          columnNumber: 4,
          source: 'return main();',
          context: 'user',
          generatedColumn: 99,
        },
      ],
      diagnosticSource: 'runtime-worker',
    });
    const extensible = parsed as typeof parsed & {
      diagnosticSource?: unknown;
      stackFrames?: Array<Record<string, unknown>>;
    };

    expect(parsed.details).toEqual(geometryInvalidIssue.details);
    expect(extensible.stackFrames?.[0]).toMatchObject({ context: 'user', generatedColumn: 99 });
    expect(extensible.diagnosticSource).toBe('runtime-worker');
  });

  it('should allow get_kernel_result outputs to carry runtime GEOMETRY_INVALID issues', () => {
    expect(
      getKernelResultOutputSchema.safeParse({
        status: 'ready',
        kernelIssues: [geometryInvalidIssue],
      }).success,
    ).toBe(true);

    expect(
      rpcSchemasRegistry[rpcName.getKernelResult].resultSchema.safeParse({
        success: true,
        status: 'ready',
        kernelIssues: [geometryInvalidIssue],
      }).success,
    ).toBe(true);
  });
});
