import { describe, expect, it } from 'vitest';
import { listDegreesOfFreedom } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import {
  findKinematicsJointByComponent,
  getKinematicsRootDriver,
  getKinematicsStructure,
} from '#utils/kinematics-structure.utils.js';

// A ring drives a second ring, which drives a vane (a chain); a sleeve drives a door on a welded bracket.
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'engine',
  links: {
    engine: { components: ['engine'] },
    ring: { components: ['ring'] },
    stage: { components: ['stage'] },
    vane: { components: ['vane'] },
    sleeve: { components: ['sleeve'] },
    bracket: { components: ['bracket', 'bolt'] },
    door: { components: ['door'] },
  },
  joints: {
    ring: { type: 'revolute', parent: 'engine', child: 'ring', origin: [0, 0, 0], axis: [1, 0, 0] },
    stage: { type: 'revolute', parent: 'engine', child: 'stage', origin: [0, 0, 0], axis: [1, 0, 0] },
    vane: { type: 'revolute', parent: 'engine', child: 'vane', origin: [0, 0, 0], axis: [0, 0, 1] },
    sleeve: { type: 'prismatic', parent: 'engine', child: 'sleeve', origin: [0, 0, 0], axis: [1, 0, 0] },
    bracket: { type: 'fixed', parent: 'sleeve', child: 'bracket', origin: [0, 0, 0] },
    door: { type: 'revolute', parent: 'bracket', child: 'door', origin: [0, 0, 0], axis: [0, 1, 0] },
  },
  couplings: [
    { driver: 'ring', follower: 'stage', ratio: 0.8 },
    { driver: 'stage', follower: 'vane', ratio: 1 },
    { driver: 'sleeve', follower: 'door', curve: { driverPeriod: 100, values: [0, 10] } },
  ],
};
const degreesOfFreedom = listDegreesOfFreedom(mechanism);

describe('getKinematicsStructure', () => {
  it('should group a chain of followers under the driver it starts from', () => {
    const structure = getKinematicsStructure(mechanism, degreesOfFreedom);

    expect(structure.drivers.map((dof) => dof.id)).toEqual(['ring', 'sleeve']);
    expect(structure.followersByDriver.get('ring')?.map((dof) => dof.id)).toEqual(['stage', 'vane']);
    expect(structure.followersByDriver.get('sleeve')?.map((dof) => dof.id)).toEqual(['door']);
  });

  it('should list the parts a joint carries through welded links and a driver moves through its followers', () => {
    const structure = getKinematicsStructure(mechanism, degreesOfFreedom);

    expect(structure.componentsByJoint.get('sleeve')).toEqual(['sleeve', 'bracket', 'bolt', 'door']);
    expect(structure.componentsByDriver.get('ring')).toEqual(['ring', 'stage', 'vane']);
    expect(structure.componentsByDriver.get('sleeve')).toEqual(['sleeve', 'bracket', 'bolt', 'door']);
  });

  it('should compute a loaded mechanism once', () => {
    expect(getKinematicsStructure(mechanism, degreesOfFreedom)).toBe(
      getKinematicsStructure(mechanism, degreesOfFreedom),
    );
  });
});

describe('getKinematicsRootDriver', () => {
  it('should resolve a follower of a follower to the chain driver', () => {
    const vane = degreesOfFreedom.find((dof) => dof.id === 'vane')!;

    expect(getKinematicsRootDriver(vane, degreesOfFreedom)).toBe('ring');
  });
});

describe('findKinematicsJointByComponent', () => {
  it.each([
    ['a part on a moving link', 'door', 'door'],
    ['a part welded to a moving link', 'bolt', 'sleeve'],
    ['a grounded part', 'engine', undefined],
    ['a part in no link', 'label', undefined],
  ])('should resolve %s', (_name, componentId, jointId) => {
    expect(findKinematicsJointByComponent(mechanism, componentId)).toBe(jointId);
  });
});
