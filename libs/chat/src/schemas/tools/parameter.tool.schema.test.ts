import { describe, expect, it } from 'vitest';
import {
  applyParameterOperationInputSchema,
  applyParameterOperationOutputSchema,
  getParametersInputSchema,
  parameterSetOperationSchema,
} from '#schemas/tools/parameter.tool.schema.js';

describe('parameter tool schemas', () => {
  it('admits the checked operation contract and refuses non-finite or extra data', () => {
    const input = {
      targetFile: 'main.py',
      requestId: 'agent:1',
      expected: { manifestRevision: 'manifest' },
      pressure: 'final',
      operation: {
        kind: 'unit-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test',
        pointer: '/width',
        inputUnit: 'cm',
        value: '2.5',
      },
    };

    expect(applyParameterOperationInputSchema.parse(input)).toEqual(input);
    expect(
      parameterSetOperationSchema.safeParse({
        ...input.operation,
        kind: 'native-value',
        value: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ success: false });
    expect(
      getParametersInputSchema.safeParse({
        targetFile: 'main.py',
        unknown: true,
      }),
    ).toMatchObject({ success: false });
  });

  it('keeps the source-unit capability explicit and refuses pinned source digests', () => {
    expect(
      parameterSetOperationSchema.safeParse({
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test',
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: 'build123d',
          sourceRevision: 'source',
          capability: 'literal-v1',
        },
      }),
    ).toMatchObject({ success: true });
    // A source change already produces a new manifest revision; no source digest is carried.
    expect(
      parameterSetOperationSchema.safeParse({
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test',
        pointer: '/width',
        unit: 'cm',
        producerCapability: { producer: 'build123d', sourceRevision: 'source', capability: 'literal-v1' },
        dependencies: { source: 'source' },
      }),
    ).toMatchObject({ success: false });
  });

  it('admits explicit confirmation and cancellation continuations', () => {
    expect(
      applyParameterOperationInputSchema.safeParse({
        action: 'confirm',
        targetFile: 'main.py',
        requestId: 'agent:1',
        planFingerprint: 'plan:1',
      }),
    ).toMatchObject({ success: true });
    expect(
      applyParameterOperationInputSchema.safeParse({
        action: 'cancel',
        targetFile: 'main.py',
        requestId: 'agent:1',
      }),
    ).toMatchObject({ success: true });
    expect(
      applyParameterOperationOutputSchema.safeParse({
        outcome: {
          status: 'confirmation-required',
          requestId: 'agent:1',
          planFingerprint: 'plan:1',
          producerCapability: {
            producer: 'build123d',
            sourceRevision: 'source',
            capability: 'literal-v1',
          },
          proposed: {
            entry: { activeGroup: 'default', groups: { default: { values: { width: 25 } } } },
            identity: { manifestRevision: 'manifest' },
          },
        },
      }),
    ).toMatchObject({ success: true });
  });
});
