import { describe, expectTypeOf, it } from 'vitest';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

import type { ConfigurationDefinition } from '#configuration/configuration.js';
import { defineMachine } from '#machines/machine.js';
import type { MachineProviderDefinition, MachineSession, MachineTransportTrust } from '#machines/machine.js';
import { machineManifestDefinitionFixture } from '#machines/machine-manifest.fixture.js';
import type { MachineAlert } from '#machines/machine-observation.js';

type Binding = Readonly<{ logicalId: string }>;
type Submission = Readonly<{ copies: number }>;
type Schema<Value> = StandardSchemaV1<Value, Value> & StandardJSONSchemaV1<Value, Value>;

declare const bindingConfiguration: ConfigurationDefinition<Schema<Binding>>;
declare const submissionConfiguration: ConfigurationDefinition<Schema<Submission>>;

const definition = {
  id: 'typed-machine',
  name: 'Typed machine',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'test',
  manifest: machineManifestDefinitionFixture,
  bindingConfiguration,
  submissionConfiguration,
  async *discover(input, runtime) {
    expectTypeOf(input.configuration).toEqualTypeOf<Binding>();
    expectTypeOf(runtime).not.toHaveProperty('resolveSecret');
    yield* [];
  },
  async connect(input, runtime) {
    expectTypeOf(input.configuration).toEqualTypeOf<Binding>();
    expectTypeOf(input.connection.secretRef).toEqualTypeOf<string>();
    expectTypeOf(input.connection.serviceTrust['mqtt']).toEqualTypeOf<MachineTransportTrust | undefined>();
    expectTypeOf(runtime.resolveSecret).toBeFunction();
    throw new Error('type witness');
  },
} as const satisfies MachineProviderDefinition<'typed-machine', Schema<Binding>, Schema<Submission>>;

const machine = defineMachine(definition);
const registration = machine();

describe('machine authoring types', () => {
  it('preserves the provider identity', () => {
    expectTypeOf(registration.id).toEqualTypeOf<'typed-machine'>();
  });
});

describe('machine observation and manifest types', () => {
  it('should make stop a session method every provider has, outside the gated facets', () => {
    expectTypeOf<MachineSession['stop']>().toBeFunction();
    expectTypeOf<MachineSession['actions']>().toHaveProperty('type');
  });

  it('should carry a readable alert whose severity is a closed set', () => {
    const alert: MachineAlert = {
      code: '0C00-0300-0003-000B',
      blocks: 'run',
      severity: 'serious',
      message: 'The first layer is not sticking to the plate.',
      reference: 'https://support.example.com/codes/0C00-0300-0003-000B',
    };
    expectTypeOf(alert.severity).toEqualTypeOf<'fatal' | 'serious' | 'warning' | 'info' | undefined>();
    expectTypeOf(alert.message).toEqualTypeOf<string | undefined>();
    expectTypeOf(alert.reference).toEqualTypeOf<string | undefined>();
    // @ts-expect-error -- a severity outside the four levels is refused.
    const critical: MachineAlert = { code: '0300-400C', severity: 'critical', blocks: 'nothing' };
    expectTypeOf(critical).toEqualTypeOf<MachineAlert>();
  });
});
