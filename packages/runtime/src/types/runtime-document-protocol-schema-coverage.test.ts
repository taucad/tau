/** The document protocol inventory and its validators must advance together. */
import { describe, expect, it } from 'vitest';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';
import {
  documentProtocolCallNames,
  documentProtocolClientNotifyNames,
  documentProtocolNotifyNames,
  documentProtocolWorkerNotifyNames,
} from '#types/runtime-document-protocol.types.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';

describe('document protocol schema coverage (C15)', () => {
  it('binds the v4 hello and exact six-call, twenty-notify inventory', () => {
    expect(runtimeDocumentProtocolSchemas.hello).toBeDefined();
    expect(Object.keys(runtimeDocumentProtocolSchemas.calls)).toEqual([...documentProtocolCallNames]);
    expect(Object.keys(runtimeDocumentProtocolSchemas.notifies)).toEqual([...documentProtocolNotifyNames]);
    expect(documentProtocolCallNames).toHaveLength(6);
    expect(documentProtocolClientNotifyNames).toHaveLength(8);
    expect(documentProtocolWorkerNotifyNames).toHaveLength(12);
    expect(documentProtocolNotifyNames).toHaveLength(20);
    expect(Object.keys(runtimeDocumentProtocolSchemas.listens)).toEqual([]);
  });

  it('validates arguments and results for every acknowledged call', () => {
    for (const [name, schema] of Object.entries(runtimeDocumentProtocolSchemas.calls)) {
      expect(schema.args, `${name} args`).toBeDefined();
      expect(schema.result, `${name} result`).toBeDefined();
    }
  });

  it('admits canonical issue codes and rejects retired geometry codes', () => {
    const schema = runtimeDocumentProtocolSchemas.calls.export.result;
    for (const code of kernelIssueCodeValues) {
      expect(
        schema.safeParse({ success: false, issues: [{ code, severity: 'error', message: `${code} message` }] }).success,
        code,
      ).toBe(true);
    }
    expect(
      schema.safeParse({
        success: false,
        issues: [{ code: `JSCAD_${'GEOMETRY'}_INVALID`, severity: 'error', message: 'retired code' }],
      }).success,
    ).toBe(false);
  });

  it('requires at least one safe, MIME-typed export file', () => {
    const schema = runtimeDocumentProtocolSchemas.calls.export.result;
    const valid = {
      success: true,
      exportId: 'bom',
      evaluationId: 'evaluation',
      files: [
        { name: 'bom.csv', mimeType: 'text/csv', bytes: { delivery: 'inline', bytes: new Uint8Array([1]) } },
        { name: 'detail.bin', mimeType: 'application/octet-stream', bytes: { delivery: 'pooled', key: 'pool-1' } },
      ],
      issues: [],
    };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, files: [] }).success).toBe(false);
    expect(
      schema.safeParse({
        ...valid,
        files: [{ name: '../bom.csv', mimeType: 'text/csv', bytes: valid.files[0]?.bytes }],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, files: [{ name: 'bom.csv', bytes: valid.files[0]?.bytes }] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ ...valid, files: [{ name: 'bom.csv', mimeType: '   ', bytes: valid.files[0]?.bytes }] })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, files: [{ ...valid.files[0], futureField: true }] }).success).toBe(true);
  });
});
