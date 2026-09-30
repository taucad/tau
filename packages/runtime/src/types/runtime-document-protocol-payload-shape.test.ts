/** Concrete v4 payloads must pass the validators used by every transport. */
import { describe, expect, it } from 'vitest';
import { contentDigest } from '@taucad/cache-core';
import { compileParameterManifest } from '@taucad/parameters';
import { runtimeDocumentProtocolSchemas as wire } from '#types/runtime-document-protocol.schemas.js';

const file = { path: '/', filename: 'main.ts' };
const issue = { code: 'RUNTIME', severity: 'error', message: 'Fixture failure' };
const capabilities = { registrations: [], routes: [], renderCapabilities: {} };
const binary = { delivery: 'inline', bytes: new Uint8Array([1]) };
const sourceRevision = { entry: 'main.ts', files: { 'main.ts': `sha256:${'a'.repeat(64)}` } };

describe('document protocol payload-shape coverage (C18)', () => {
  it('admits every acknowledged call argument and result shape', () => {
    const cases = {
      initialize: { args: { config: { mode: 'test' } }, result: { capabilities } },
      describe: {
        args: { file, stage: { 'main.ts': new Uint8Array([1]) } },
        result: { success: false, kernelId: undefined, issues: [issue] },
      },
      export: {
        args: { documentId: 'doc', operationId: 'write-1', target: 'bom', options: {} },
        result: {
          success: true,
          exportId: 'bom',
          evaluationId: 'evaluation-1',
          files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: binary }],
          issues: [],
          sourceRevision,
        },
      },
      snapshotSource: {
        args: { file, additionalPaths: [{ path: 'sidecar.json', required: false }] },
        result: {
          success: true,
          data: {
            entryPath: 'main.ts',
            files: [{ path: 'main.ts', content: new Uint8Array([1]), sha256: 'a'.repeat(64), role: 'entry' }],
            unresolvedPaths: [],
            kernelId: 'fixture',
          },
          issues: [],
        },
      },
      transcode: {
        args: {
          from: 'x-cad-source',
          to: 'x-cad-export',
          files: [{ name: 'part.xcad', mimeType: 'application/x-cad', bytes: new Uint8Array([1]) }],
          options: {},
        },
        result: {
          success: true,
          data: [{ name: 'part.out', mimeType: 'application/x-cad', bytes: binary }],
          issues: [],
        },
      },
      dispose: { args: null, result: null },
    } as const;
    for (const name of Object.keys(cases) as Array<keyof typeof cases>) {
      const sample = cases[name];
      const schema = wire.calls[name];
      expect(schema.args.safeParse(sample.args).success, `${name} args`).toBe(true);
      expect(schema.result.safeParse(sample.result).success, `${name} result`).toBe(true);
    }
    expect(wire.calls.dispose.args.safeParse(undefined).success).toBe(false);
  });

  it('admits all eight client commands and rejects missing operation identity', () => {
    const commands = {
      open: { documentId: 'doc', intent: 0, file, parameters: {}, watch: false },
      update: { documentId: 'doc', intent: 1, parameters: { count: 2 } },
      close: { documentId: 'doc' },
      openView: { documentId: 'doc', subscriptionId: 'view', requestId: 'request', view: 'model' },
      updateView: { subscriptionId: 'view', requestId: 'request-2', options: {} },
      closeView: { subscriptionId: 'view' },
      abort: { operationId: 'write-1', reason: 2 },
      binaryMaterialised: { key: 'pool-1' },
    } as const;
    for (const name of Object.keys(commands) as Array<keyof typeof commands>) {
      expect(wire.notifies[name].safeParse(commands[name]).success, name).toBe(true);
    }
    expect(wire.notifies.open.safeParse({ file, parameters: {}, watch: false }).success).toBe(false);
    expect(wire.notifies.abort.safeParse({ reason: 2 }).success).toBe(false);
    expect(wire.notifies.update.safeParse({ documentId: 'doc', intent: 1, transient: true, stage: {} }).success).toBe(
      false,
    );
  });

  it('admits all twelve host notifications, including failed view and telemetry envelopes', () => {
    const events = {
      described: { documentId: 'doc', intent: 0, evaluationId: 'evaluation-1', success: false, issues: [issue] },
      evaluating: { documentId: 'doc', intent: 0, evaluationId: 'evaluation-1', transient: false },
      evaluated: {
        documentId: 'doc',
        intent: 0,
        success: false,
        id: 'evaluation-1',
        transient: false,
        issues: [issue],
      },
      rendering: { subscriptionId: 'view', requestId: 'request', evaluationId: 'evaluation-1', intent: 0 },
      rendered: {
        subscriptionId: 'view',
        requestId: 'request',
        evaluationId: 'evaluation-1',
        intent: 0,
        success: false,
        transient: false,
        issues: [issue],
      },
      progress: {
        documentId: 'doc',
        intent: 0,
        evaluationId: 'evaluation-1',
        operationId: 'evaluate-1',
        phase: 'evaluate',
      },
      errorEvent: {
        scope: 'operation',
        documentId: 'doc',
        intent: 0,
        operationId: 'write-1',
        code: 'OPERATION_TIMEOUT',
        phase: 'write',
        message: 'Timed out',
      },
      stateChanged: { state: 'error' },
      log: { entry: { id: 'log-1', timestamp: 1, level: 'debug', message: 'Fixture log' } },
      logBatch: { entries: [{ id: 'log-2', timestamp: 2, level: 'info', message: 'Another log' }] },
      telemetry: {
        entries: [{ name: 'evaluate', startTime: 1, duration: 2, workerTimeOrigin: 0 }],
        origin: { label: 'worker', instance: 'instance-1' },
        epoch: 1,
      },
      capabilitiesUpdated: { capabilities },
    } as const;
    for (const name of Object.keys(events) as Array<keyof typeof events>) {
      expect(wire.notifies[name].safeParse(events[name]).success, name).toBe(true);
    }
  });

  it('preserves additive capability metadata while rejecting malformed known branch fields', () => {
    const manifest = {
      registrations: [{ kind: 'kernel', id: 'fixture', extensions: ['ts'], futureRegistration: true }],
      routes: [
        {
          targetFormat: 'x-cad-export',
          kernelId: 'fixture',
          sourceFormat: 'x-cad-source',
          fidelity: 'mesh',
          exportOptions: { schema: {}, defaults: {}, futureOption: true },
          futureRoute: true,
        },
      ],
      renderCapabilities: { fixture: { renderOptions: { schema: {}, defaults: {} }, futureCapability: true } },
      futureManifest: true,
    };
    expect(wire.calls.initialize.result.safeParse({ capabilities: manifest }).success).toBe(true);
    expect(wire.notifies.capabilitiesUpdated.safeParse({ capabilities: manifest }).success).toBe(true);
    expect(
      wire.calls.initialize.result.safeParse({
        capabilities: { ...manifest, routes: [{ ...manifest.routes[0], fidelity: 'lossless' }] },
      }).success,
    ).toBe(false);
    expect(
      wire.notifies.progress.parse({
        documentId: 'doc',
        intent: 0,
        evaluationId: 'evaluation-1',
        operationId: 'evaluate-1',
        phase: 'evaluate',
        futureEstimate: 250,
      }),
    ).toMatchObject({ phase: 'evaluate' });
  });

  it('admits a complete described parameter manifest and rejects the retired draft result', async () => {
    const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}`, name: 'test digest' });
    const parameters = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:wire-parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'WireParameters',
          type: 'object',
          properties: { length: { type: 'double', ucumUnit: 'mm' } },
        },
        defaults: { length: 1 },
      },
      scope: { kind: 'source', authority: 'filesystem', root: '', entry: 'main.ts' },
      source: { id: 'wire-kernel', version: '1', revision: digest, capability: 'json-structure' },
      dependency: digest,
      middleware: digest,
    });
    const envelope = {
      documentId: 'doc',
      intent: 0,
      evaluationId: 'evaluation-1',
      success: true,
      kernelId: 'fixture',
      issues: [],
    };
    expect(wire.notifies.described.safeParse({ ...envelope, parameters }).success).toBe(true);
    expect(
      wire.notifies.described.safeParse({ ...envelope, parameters: { defaultParameters: {}, jsonSchema: {} } }).success,
    ).toBe(false);
  });

  it('preserves SVG coordinate units and rejects invalid known unit symbols', () => {
    const rendered = {
      subscriptionId: 'view',
      requestId: 'request',
      evaluationId: 'evaluation-1',
      intent: 0,
      success: true,
      view: 'drawing',
      artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
      hash: 'drawing-hash',
      transient: false,
      issues: [],
    } as const;
    expect(wire.notifies.rendered.safeParse(rendered).success).toBe(true);
    expect(
      wire.notifies.rendered.safeParse({ ...rendered, artifact: { ...rendered.artifact, units: { length: 'mm' } } })
        .success,
    ).toBe(true);
    expect(
      wire.notifies.rendered.safeParse({ ...rendered, artifact: { ...rendered.artifact, units: { length: 'pixels' } } })
        .success,
    ).toBe(false);
  });
});
