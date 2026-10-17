import { expectTypeOf, it } from 'vitest';
import type { JointInterface, JointEndpoint, MechanismIntent } from '@taucad/geometry-core';

it('should expose portable local interfaces and assembly-owned endpoint references', () => {
  const endpoint: JointEndpoint = { componentId: 'rotor', interfaceId: 'shaft' };
  const attachment: JointInterface = {
    kind: 'prismatic',
    frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ranges: { distance: { lower: 0 } },
  };
  const intent: MechanismIntent = {
    schemaVersion: 1,
    units: { length: 'm', angle: 'deg' },
    rigidBodies: { rotor: ['rotor', 'cover'], tool: [] },
    connections: [{ id: 'mount', parent: endpoint, child: { componentId: 'tool', interfaceId: 'mount' } }],
  };
  expectTypeOf(attachment.frame).toEqualTypeOf<
    readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
  >();
  expectTypeOf(intent.connections[0]!.parent).toEqualTypeOf<JointEndpoint>();
  expectTypeOf(intent.rigidBodies).toEqualTypeOf<Readonly<Record<string, readonly string[]>> | undefined>();
  // @ts-expect-error Body membership references topology components, not renderer indices.
  const invalidBodies: MechanismIntent['rigidBodies'] = { rotor: [0] };
  expectTypeOf(invalidBodies).toEqualTypeOf<MechanismIntent['rigidBodies']>();
  // @ts-expect-error An endpoint identifies a component occurrence, not a renderer node index.
  const rendererEndpoint: JointEndpoint = { nodeIndex: 2, interfaceId: 'shaft' };
  expectTypeOf(rendererEndpoint).toEqualTypeOf<JointEndpoint>();
  // @ts-expect-error Physical intent units use the shared wire unit vocabulary.
  const invalidUnits: MechanismIntent['units'] = { length: 'inch', angle: 'deg' };
  expectTypeOf(invalidUnits).toEqualTypeOf<MechanismIntent['units']>();
});
