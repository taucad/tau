import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it, vi } from 'vitest';

import { defineConfiguration } from '#configuration/configuration.js';
import { defineMachine } from '#machines/machine.js';
import type { MachineConnectionRuntime, MachineConnectInput, MachineSession } from '#machines/machine.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { machineManifestDefinitionFixture } from '#machines/machine-manifest.fixture.js';
import { fixtureSession } from '#machines/machine-session.fixture.js';

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
const { jobs } = machineManifestDefinitionFixture;
if (jobs.type !== 'supported') {
  throw new Error('The fixture runs jobs.');
}
const [accepted] = jobs.accepts;
if (accepted === undefined) {
  throw new Error('The fixture accepts one container.');
}
const withAccepts = (accepts: readonly unknown[]) => ({
  ...machineManifestDefinitionFixture,
  jobs: { ...jobs, accepts },
});

describe('defineMachine', () => {
  it('keeps authoring and invocation lazy while exposing frozen serializable metadata', async () => {
    const discover = vi.fn(async function* () {
      yield {
        type: 'found',
        candidate: {
          id: 'printer-1',
          name: 'Test printer',
          endpoint: { transport: 'network', address: 'printer.local', interface: 'en0' },
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
      protocolVersion: 2,
      vendor: 'test',
      manifest: machineManifestDefinitionFixture,
      bindingConfiguration,
      submissionConfiguration,
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
          endpoint: {
            address: input.candidate.endpoint.transport === 'network' ? input.candidate.endpoint.address : '',
            port: 8883,
          },
          transport: 'tls',
          trust: mqttTrust,
          connectTimeout: 1000,
          idleTimeout: 5000,
          maximumReadBytes: 4096,
          maximumWriteBytes: 4096,
          signal: input.signal,
        });
        return fixtureSession({ close });
      },
    } as const;
    const machine = defineMachine(definition);

    expect(discover).not.toHaveBeenCalled();
    expect(connections).toBe(0);
    const registration = machine();
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.manifest.jobs)).toBe(true);
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
      protocolVersion: 2,
      vendor: 'test',
      manifest: machineManifestDefinitionFixture,
      bindingConfiguration,
      submissionConfiguration,
      async *discover() {
        yield* [];
      },
      async connect() {
        throw new Error('not called');
      },
    } as const;
    const defineUnchecked = defineMachine as unknown as (definition: unknown) => unknown;
    expect(() => defineUnchecked({ ...base, manifest: withAccepts([accepted, accepted]) })).toThrow(
      'duplicate accepted contract',
    );
    expect(() => defineUnchecked({ ...base, protocolVersion: 1 })).toThrow('protocolVersion must be 2');
    expect(() =>
      defineUnchecked({ ...base, manifest: withAccepts([{ ...accepted, requiredMembers: ['../plate.gcode'] }]) }),
    ).toThrow('accepted container is invalid');
    expect(() =>
      defineUnchecked({ ...base, manifest: withAccepts([{ ...accepted, payloadSelection: 'invalid' }]) }),
    ).toThrow();
  });
});
