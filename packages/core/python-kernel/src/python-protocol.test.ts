import { describe, expect, it } from 'vitest';

import {
  pythonArtifactSchema,
  pythonIssueSchema,
  pythonProtocolVersion,
  pythonReadySchema,
  pythonResponseSchema,
} from '#python-protocol.js';

describe('the Python worker protocol', () => {
  it('accepts the frames tau_kernel.protocol writes', () => {
    const issue = {
      message: 'bad',
      code: 'SYNTAX_ERROR',
      type: 'syntax',
      severity: 'error',
      location: { fileName: 'main.py', startLineNumber: 3, startColumn: 1 },
    };

    expect(
      pythonReadySchema.parse({ protocolVersion: pythonProtocolVersion, type: 'ready', pythonVersion: '3.13' }),
    ).toBeDefined();
    expect(pythonIssueSchema.parse(issue)).toEqual(issue);
    expect(pythonResponseSchema.parse({ protocolVersion: 1, requestId: 'r', error: { issues: [issue] } })).toEqual({
      protocolVersion: 1,
      requestId: 'r',
      error: { issues: [issue] },
    });
    expect(pythonArtifactSchema.parse({ artifactPath: '/a/model.glb', byteLength: 0 })).toEqual({
      artifactPath: '/a/model.glb',
      byteLength: 0,
    });
  });

  it('refuses another protocol version, an empty issue list and a negative artifact size', () => {
    expect(pythonReadySchema.safeParse({ protocolVersion: 2, type: 'ready', pythonVersion: '3.13' }).success).toBe(
      false,
    );
    expect(pythonResponseSchema.safeParse({ protocolVersion: 1, requestId: 'r', error: { issues: [] } }).success).toBe(
      false,
    );
    expect(pythonArtifactSchema.safeParse({ artifactPath: '/a', byteLength: -1 }).success).toBe(false);
  });
});
