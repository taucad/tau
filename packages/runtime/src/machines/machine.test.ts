import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it, vi } from 'vitest';

import { defineConfiguration } from '#configuration/configuration.js';
import { defineMachine, defineMachineQuery } from '#machines/machine.js';
import type { MachineConnectionRuntime, MachineConnectInput, MachineSession } from '#machines/machine.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';

type Binding = Readonly<{ logicalId: string }>;
type Submission = Readonly<{ copies: number }>;

const standardSchema = <Value>(
  jsonSchema: Readonly<Record<string, unknown>>,
): StandardSchemaV1<Value, Value> & StandardJSONSchemaV1<Value, Value> => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => ({ value: value as Value }),
    jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
  },
});

const bindingConfiguration = defineConfiguration({
  id: 'test.machine.binding',
  version: '1.0.0',
  schema: standardSchema<Binding>({ type: 'object', properties: { logicalId: { type: 'string' } } }),
  ui: { version: 1, rjsf: {} },
});
const submissionConfiguration = defineConfiguration({
  id: 'test.machine.submission',
  version: '1.0.0',
  schema: standardSchema<Submission>({ type: 'object', properties: { copies: { type: 'integer', minimum: 1 } } }),
  ui: { version: 1, rjsf: {} },
});
const querySchema = standardSchema<Readonly<{ vendor: string }>>({
  type: 'object',
  properties: { vendor: { type: 'string' } },
});

const accepted = {
  contract: { id: 'manufacturing.toolpath.fff', version: 1 },
  mediaType: 'application/zip',
  requiredMembers: ['plate.gcode'],
  payloadSelection: 'plate',
  technology: 'fff',
} as const;

describe('defineMachine', () => {
  it('keeps authoring and invocation lazy while exposing frozen serializable metadata', async () => {
    const discover = vi.fn(async function* () {
      yield {
        type: 'found',
        candidate: {
          id: 'printer-1',
          name: 'Test printer',
          endpoint: { address: 'printer.local', interface: 'en0' },
          claimedIdentity: { serial: 'claimed-serial', model: 'claimed-model' },
          observedAt: '2026-09-05T00:00:00Z',
          expiresAt: '2026-09-05T00:00:30Z',
        },
      } as const;
    });
    let connections = 0;
    let closes = 0;
    const close = async () => {
      if (closes === 0) {
        closes += 1;
      }
    };
    const definition = {
      id: 'test-machine',
      name: 'Test machine',
      version: '1.0.0',
      protocolVersion: 1,
      vendor: 'test',
      technologies: ['fff'],
      accepts: [accepted],
      bindingConfiguration,
      submissionConfiguration,
      queries: {
        materials: defineMachineQuery({
          inputSchema: querySchema,
          resultSchema: querySchema,
          async query(input: Readonly<{ vendor: string }>) {
            return input;
          },
        }),
      },
      discover,
      async connect(
        input: MachineConnectInput<Binding>,
        runtime: MachineConnectionRuntime,
      ): Promise<MachineSession<Submission>> {
        connections += 1;
        const mqttTrust = input.connection.serviceTrust['mqtt'];
        if (mqttTrust === undefined) {
          throw new Error('Missing host-approved MQTT trust.');
        }
        await runtime.resolveSecret({ reference: input.connection.secretRef, signal: input.signal });
        await runtime.connectStream({
          endpoint: { address: input.candidate.endpoint.address, port: 8883 },
          transport: 'tls',
          trust: mqttTrust,
          connectTimeout: 1000,
          idleTimeout: 5000,
          maximumReadBytes: 4096,
          maximumWriteBytes: 4096,
          signal: input.signal,
        });
        return {
          async getDescriptor() {
            return {
              id: 'printer-1',
              name: 'Test printer',
              vendor: 'test',
              model: 'fake',
              technology: 'fff',
              firmware: 'test',
              accepts: [accepted],
              operations: ['submit'],
              ratedEnvelope: { width: 0.3, depth: 0.3, height: 0.3, unit: 'm' },
              printableEnvelope: { width: 0.25, depth: 0.25, height: 0.25, unit: 'm' },
              tools: [{ id: 'tool-0', kind: 'extruder', nozzleDiameter: 0.0004 }],
              materialSystem: { kind: 'single', slotCount: 1 },
              bedTypes: ['textured'],
            };
          },
          async getSnapshot() {
            return {
              connection: 'connected',
              readiness: 'idle',
              observedAt: 'now',
              setup: { toolId: 'tool-0', bedType: 'textured', materials: [] },
            };
          },
          async *observe() {
            yield* [];
          },
          async submit() {
            return { status: 'accepted', observedAt: 'now' };
          },
          async control() {
            return { status: 'accepted', observedAt: 'now' };
          },
          stillCapture: { type: 'unsupported' },
          close,
          dispose: close,
        };
      },
    } as const;
    const machine = defineMachine(definition);

    expect(discover).not.toHaveBeenCalled();
    expect(connections).toBe(0);
    const registration = machine();
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.accepts)).toBe(true);
    expect(() => structuredClone(registration)).not.toThrow();
    expect(connections).toBe(0);
    await expect(resolveRuntimePluginDefinition('machine', registration)).resolves.toBe(definition);

    const trusted = await resolveRuntimePluginDefinition('machine', registration);
    const events = [];
    for await (const event of trusted.discover(
      { configuration: { logicalId: 'workshop-x1c' }, signal: new AbortController().signal },
      {
        clock: { now: () => 'now' },
        async *listenDatagrams() {
          yield* [];
        },
      },
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    const connectStream = vi.fn(async () => ({
      readable: {
        async *[Symbol.asyncIterator]() {
          yield* [];
        },
      },
      write: async () => undefined,
      close: async () => undefined,
    }));
    const resolveSecret = vi.fn(async () => 'secret');
    const [candidateEvent] = events;
    if (candidateEvent === undefined || candidateEvent.type === 'lost') {
      throw new Error('Expected one discovered candidate.');
    }
    const { candidate } = candidateEvent;
    const connectionSignal = new AbortController().signal;
    const session = await trusted.connect(
      {
        candidate,
        configuration: { logicalId: 'workshop-x1c' },
        connection: {
          secretRef: 'vault:printer-1',
          serviceTrust: { mqtt: { type: 'system' } },
        },
        signal: connectionSignal,
      },
      {
        clock: { now: () => 'now' },
        log: async () => undefined,
        connectStream,
        async *readArtifact() {
          yield* [];
        },
        resolveSecret,
      },
    );
    expect(resolveSecret).toHaveBeenCalledWith({
      reference: 'vault:printer-1',
      signal: connectionSignal,
    });
    expect(connectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: 'printer.local', port: 8883 },
        transport: 'tls',
        trust: { type: 'system' },
      }),
    );
    expect(JSON.stringify(registration.bindingConfiguration)).not.toContain('printer.local');
    expect(registration).not.toHaveProperty('endpoint');
    expect(registration).not.toHaveProperty('secretRef');
    expect(registration).not.toHaveProperty('serviceTrust');
    await session.close();
    await session.dispose();
    expect(closes).toBe(1);
  });

  it('rejects invalid protocol and duplicate semantic acceptance contracts', () => {
    const base = {
      id: 'invalid',
      name: 'Invalid',
      version: '1.0.0',
      protocolVersion: 1,
      vendor: 'test',
      technologies: ['fff'],
      accepts: [accepted],
      bindingConfiguration,
      submissionConfiguration,
      async *discover() {
        yield* [];
      },
      async connect() {
        throw new Error('not called');
      },
    } as const;
    expect(() => defineMachine({ ...base, accepts: [accepted, accepted] })).toThrow('duplicate accepted contract');
    const defineUnchecked = defineMachine as unknown as (definition: unknown) => unknown;
    expect(() => defineUnchecked({ ...base, protocolVersion: 2 })).toThrow('protocolVersion must be 1');
    expect(() =>
      defineUnchecked({
        ...base,
        accepts: [{ ...accepted, requiredMembers: ['../plate.gcode'] }],
      }),
    ).toThrow('accepted container is invalid');
    expect(() =>
      defineUnchecked({
        ...base,
        accepts: [{ ...accepted, payloadSelection: 'invalid' }],
      }),
    ).toThrow('payload selection is invalid');
  });

  it('rejects unsupported behavioral schemas declared by catalog queries', () => {
    const unsafeQuery = defineMachineQuery({
      inputSchema: standardSchema({ type: 'string', pattern: '(a+)+$' }),
      resultSchema: querySchema,
      async query() {
        return { vendor: 'test' };
      },
    });
    const defineUnchecked = defineMachine as unknown as (definition: unknown) => unknown;
    expect(() =>
      defineUnchecked({
        id: 'unsafe-query',
        name: 'Unsafe query',
        version: '1.0.0',
        protocolVersion: 1,
        vendor: 'test',
        technologies: ['fff'],
        accepts: [accepted],
        bindingConfiguration,
        submissionConfiguration,
        queries: { unsafe: unsafeQuery },
        async *discover() {
          yield* [];
        },
        async connect() {
          throw new Error('not called');
        },
      }),
    ).toThrow('UNSUPPORTED_KEYWORD');
  });
});
