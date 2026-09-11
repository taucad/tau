import { describe, expectTypeOf, it } from 'vitest';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

import type { ConfigurationDefinition } from '#configuration/configuration.js';
import { defineMachine, defineMachineQuery } from '#machines/machine.js';
import type { MachineDiscoveryRuntime, MachineProviderDefinition, MachineTransportTrust } from '#machines/machine.js';

type Binding = Readonly<{ logicalId: string }>;
type Submission = Readonly<{ copies: number }>;
type Schema<Value> = StandardSchemaV1<Value, Value> & StandardJSONSchemaV1<Value, Value>;

declare const bindingConfiguration: ConfigurationDefinition<Schema<Binding>>;
declare const submissionConfiguration: ConfigurationDefinition<Schema<Submission>>;
declare const querySchema: Schema<Readonly<{ vendor: string }>>;
declare const countQuerySchema: Schema<Readonly<{ minimum: number }>>;

const definition = {
  id: 'typed-machine',
  name: 'Typed machine',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'test',
  technologies: ['fff'],
  accepts: [
    {
      contract: { id: 'manufacturing.toolpath.fff', version: 1 },
      mediaType: 'application/zip',
      requiredMembers: ['plate.gcode'],
      payloadSelection: 'plate',
      technology: 'fff',
    },
  ],
  bindingConfiguration,
  submissionConfiguration,
  queries: {
    materials: defineMachineQuery({
      inputSchema: querySchema,
      resultSchema: querySchema,
      async query(input) {
        expectTypeOf(input.vendor).toEqualTypeOf<string>();
        return input;
      },
    }),
    counts: defineMachineQuery({
      inputSchema: countQuerySchema,
      resultSchema: countQuerySchema,
      async query(input) {
        expectTypeOf(input.minimum).toEqualTypeOf<number>();
        return input;
      },
    }),
  },
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
} as const satisfies MachineProviderDefinition<
  'typed-machine',
  Schema<Binding>,
  Schema<Submission>,
  {
    readonly materials: {
      readonly inputSchema: typeof querySchema;
      readonly resultSchema: typeof querySchema;
      query(
        input: Readonly<{ vendor: string }>,
        runtime: MachineDiscoveryRuntime,
      ): Promise<Readonly<{ vendor: string }>>;
    };
    readonly counts: {
      readonly inputSchema: typeof countQuerySchema;
      readonly resultSchema: typeof countQuerySchema;
      query(
        input: Readonly<{ minimum: number }>,
        runtime: MachineDiscoveryRuntime,
      ): Promise<Readonly<{ minimum: number }>>;
    };
  }
>;

const machine = defineMachine(definition);
const registration = machine();

describe('machine authoring types', () => {
  it('preserves provider and query identities', () => {
    expectTypeOf(registration.id).toEqualTypeOf<'typed-machine'>();
    expectTypeOf(registration.queries.materials).not.toBeNever();
    expectTypeOf(registration.queries.counts).not.toBeNever();
  });
});
