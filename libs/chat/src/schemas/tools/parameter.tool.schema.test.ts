import { describe, expect, it } from 'vitest';
import {
  applyParameterOperationInputSchema,
  applyParameterOperationOutputSchema,
  getParametersInputSchema,
  parameterSetOperationSchema,
} from '#schemas/tools/parameter.tool.schema.js';

const proposal = {
  action: 'propose',
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
} as const;

describe('parameter tool schemas', () => {
  it('admits the checked operation contract and refuses non-finite or extra data', () => {
    expect(applyParameterOperationInputSchema.parse(proposal)).toEqual(proposal);
    // A typeless wire value still has to be real JSON once it is past the provider boundary.
    expect(
      parameterSetOperationSchema.safeParse({
        kind: 'native-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test',
        pointer: '/width',
        value: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ success: false });
    expect(
      parameterSetOperationSchema.safeParse({
        kind: 'native-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test',
        pointer: '/width',
        value: { nested: [1, null, { deep: 'ok' }] },
      }),
    ).toMatchObject({ success: true });
    expect(
      getParametersInputSchema.safeParse({
        targetFile: 'main.py',
        unknown: true,
      }),
    ).toMatchObject({ success: false });
  });

  it.each([
    ['propose without expected', { ...proposal, expected: undefined }],
    ['propose without pressure', { ...proposal, pressure: undefined }],
    ['propose without an operation', { ...proposal, operation: undefined }],
    ['propose carrying a plan fingerprint', { ...proposal, planFingerprint: 'plan:1' }],
    ['confirm without a plan fingerprint', { action: 'confirm', targetFile: 'main.py', requestId: 'agent:1' }],
    [
      'confirm carrying an operation',
      {
        action: 'confirm',
        targetFile: 'main.py',
        requestId: 'agent:1',
        planFingerprint: 'plan:1',
        operation: proposal.operation,
      },
    ],
    [
      'cancel carrying a plan fingerprint',
      { action: 'cancel', targetFile: 'main.py', requestId: 'agent:1', planFingerprint: 'plan:1' },
    ],
    ['a missing action', { ...proposal, action: undefined }],
    ['an unknown action', { ...proposal, action: 'apply' }],
    ['an unknown field', { ...proposal, urgency: 'high' }],
  ])('refuses %s', (_case, input) => {
    expect(applyParameterOperationInputSchema.safeParse(input)).toMatchObject({ success: false });
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
    ).toMatchObject({ success: true, data: { action: 'confirm', planFingerprint: 'plan:1' } });
    expect(
      applyParameterOperationInputSchema.safeParse({
        action: 'cancel',
        targetFile: 'main.py',
        requestId: 'agent:1',
      }),
    ).toMatchObject({ success: true, data: { action: 'cancel' } });
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
