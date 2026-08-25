/**
 * Conformance test C15: every entry in `RuntimeProtocol['calls']` and
 * `RuntimeProtocol['notifies']` has a matching Zod schema in
 * `runtimeProtocolSchemas`. New protocol entries fail this test until
 * they ship a validator.
 *
 * Catches the failure mode where a developer adds a new call/notify to
 * the protocol but forgets to add its wire-validation schema — which
 * would silently disable validation for that frame on every wire that
 * opted in to `protocolSchemas`.
 */

import { describe, it, expect } from 'vitest';
import { runtimeProtocolCallNames, runtimeProtocolNotifyNames } from '#types/runtime-protocol.types.js';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';

describe('runtime-protocol schema coverage (C15)', () => {
  it('binds the hello validator and empty listen inventory explicitly', () => {
    expect(runtimeProtocolSchemas.hello).toBeDefined();
    expect(Object.keys(runtimeProtocolSchemas.listens)).toEqual([]);
  });

  it('every protocol call has a matching schema entry', () => {
    const callSchemaNames = new Set(Object.keys(runtimeProtocolSchemas.calls));
    for (const name of runtimeProtocolCallNames) {
      expect(callSchemaNames.has(name), `missing schema for call '${name}'`).toBe(true);
    }
  });

  it('every schema call entry maps to a known protocol call', () => {
    const protocolCallNames = new Set<string>(runtimeProtocolCallNames);
    for (const name of Object.keys(runtimeProtocolSchemas.calls)) {
      expect(protocolCallNames.has(name), `unknown schema entry for call '${name}'`).toBe(true);
    }
  });

  it('every call schema declares both args and result validators', () => {
    for (const [name, entry] of Object.entries(runtimeProtocolSchemas.calls)) {
      expect(entry.args, `call '${name}' missing args schema`).toBeDefined();
      expect(entry.result, `call '${name}' missing result schema`).toBeDefined();
    }
  });

  it('every protocol notify has a matching schema entry', () => {
    const notifySchemaNames = new Set(Object.keys(runtimeProtocolSchemas.notifies));
    for (const name of runtimeProtocolNotifyNames) {
      expect(notifySchemaNames.has(name), `missing schema for notify '${name}'`).toBe(true);
    }
  });

  it('every schema notify entry maps to a known protocol notify', () => {
    const protocolNotifyNames = new Set<string>(runtimeProtocolNotifyNames);
    for (const name of Object.keys(runtimeProtocolSchemas.notifies)) {
      expect(protocolNotifyNames.has(name), `unknown schema entry for notify '${name}'`).toBe(true);
    }
  });

  it('should expose exactly the protocol inventory: 4 calls and 18 notifies (T18)', () => {
    expect(Object.keys(runtimeProtocolSchemas.calls)).toHaveLength(4);
    expect(Object.keys(runtimeProtocolSchemas.notifies)).toHaveLength(18);
  });

  it('validates kernel issue codes from the canonical registry', () => {
    const legacyGeometryCode = `JSCAD_${'GEOMETRY'}_INVALID`;

    for (const code of kernelIssueCodeValues) {
      expect(
        runtimeProtocolSchemas.calls.export.result.safeParse({
          success: false,
          issues: [{ code, severity: 'error', message: `${code} message` }],
        }).success,
        `expected protocol schema to accept ${code}`,
      ).toBe(true);
    }

    expect(
      runtimeProtocolSchemas.calls.export.result.safeParse({
        success: false,
        issues: [{ code: legacyGeometryCode, severity: 'error', message: 'legacy code' }],
      }).success,
    ).toBe(false);
  });

  it('should require a non-empty export artifact set with MIME types while tolerating additive fields', () => {
    const schema = runtimeProtocolSchemas.calls.export.result;
    const valid = {
      success: true,
      data: [
        {
          name: 'model.gltf',
          mimeType: 'model/gltf+json',
          bytes: { delivery: 'inline', bytes: new Uint8Array([1]) },
        },
        {
          name: 'buffer.bin',
          mimeType: 'application/octet-stream',
          bytes: { delivery: 'pooled', key: 'buffer-key' },
        },
      ],
      issues: [],
    };

    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, data: [] }).success).toBe(false);
    expect(schema.safeParse({ ...valid, data: [{ name: 'model.glb', bytes: valid.data[0]!.bytes }] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        ...valid,
        data: [{ name: 'model.glb', mimeType: '', bytes: valid.data[0]!.bytes }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...valid,
        data: [{ name: 'model.glb', mimeType: '   ', bytes: valid.data[0]!.bytes }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...valid,
        data: [{ ...valid.data[0], unrelated: true }],
      }).success,
    ).toBe(true);
  });
});
