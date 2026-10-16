import { findLinkByComponent } from '@taucad/kinematics';
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';

/** How the Kinematics pane organises a mechanism: drivers, the followers each one moves, and the parts. */
export type KinematicsStructure = Readonly<{
  drivers: readonly DegreeOfFreedom[];
  /** Followers under the driver their coupling chain starts from, in mechanism order. */
  followersByDriver: ReadonlyMap<string, readonly DegreeOfFreedom[]>;
  /** Component ids a joint moves: its child link's and every link's beneath it. */
  componentsByJoint: ReadonlyMap<string, readonly string[]>;
  /** Component ids a driver moves, itself and through its followers. */
  componentsByDriver: ReadonlyMap<string, readonly string[]>;
}>;

const rootDriverOf = (dof: DegreeOfFreedom, byId: ReadonlyMap<string, DegreeOfFreedom>): DegreeOfFreedom => {
  let current = dof;
  // Admission rejects cyclic couplings, so the chain ends at a driver.
  while (current.coupling !== undefined) {
    const next = byId.get(current.coupling.driver);
    if (next === undefined) {
      break;
    }
    current = next;
  }
  return current;
};

const buildStructure = (mechanism: Mechanism, degreesOfFreedom: readonly DegreeOfFreedom[]): KinematicsStructure => {
  const byId = new Map(degreesOfFreedom.map((dof) => [dof.id, dof]));
  const drivers = degreesOfFreedom.filter((dof) => dof.role === 'driver');
  const followersByDriver = new Map<string, DegreeOfFreedom[]>(drivers.map((driver) => [driver.id, []]));
  for (const dof of degreesOfFreedom) {
    if (dof.role === 'follower') {
      followersByDriver.get(rootDriverOf(dof, byId).id)?.push(dof);
    }
  }

  const childLinks = new Map<string, string[]>();
  for (const joint of Object.values(mechanism.joints)) {
    childLinks.set(joint.parent, [...(childLinks.get(joint.parent) ?? []), joint.child]);
  }
  const subtreeComponents = (link: string): string[] => [
    ...(mechanism.links[link]?.components ?? []),
    ...(childLinks.get(link) ?? []).flatMap((child) => subtreeComponents(child)),
  ];
  const componentsByJoint = new Map(
    Object.entries(mechanism.joints).map(([jointId, joint]) => [jointId, subtreeComponents(joint.child)]),
  );
  const componentsByDriver = new Map(
    drivers.map((driver) => [
      driver.id,
      [
        ...new Set(
          [driver, ...(followersByDriver.get(driver.id) ?? [])].flatMap(
            (dof) => componentsByJoint.get(dof.jointId) ?? [],
          ),
        ),
      ],
    ]),
  );
  return { drivers, followersByDriver, componentsByJoint, componentsByDriver };
};

// Keyed by the degrees of freedom `loadMechanism` lists once per mechanism, so the pane's header and every panel share one.
const structures = new WeakMap<readonly DegreeOfFreedom[], KinematicsStructure>();

/** The pane's organisation of a loaded mechanism, computed once per load. */
export function getKinematicsStructure(
  mechanism: Mechanism,
  degreesOfFreedom: readonly DegreeOfFreedom[],
): KinematicsStructure {
  let structure = structures.get(degreesOfFreedom);
  if (structure === undefined) {
    structure = buildStructure(mechanism, degreesOfFreedom);
    structures.set(degreesOfFreedom, structure);
  }
  return structure;
}

/** The driver whose group holds `dof`: itself for a driver, the start of its coupling chain for a follower. */
export function getKinematicsRootDriver(dof: DegreeOfFreedom, degreesOfFreedom: readonly DegreeOfFreedom[]): string {
  return rootDriverOf(dof, new Map(degreesOfFreedom.map((candidate) => [candidate.id, candidate]))).id;
}

/**
 * The joint that moves a component: the joint whose child link carries it, or the nearest moving joint above it
 * when that one is fixed. `undefined` when the component is in no link or is grounded.
 */
export function findKinematicsJointByComponent(mechanism: Mechanism, componentId: string): string | undefined {
  const jointByChild = new Map(Object.entries(mechanism.joints).map(([jointId, joint]) => [joint.child, jointId]));
  let link = findLinkByComponent({ mechanism, componentId });
  while (link !== undefined && link !== mechanism.root) {
    const jointId = jointByChild.get(link);
    const joint = jointId === undefined ? undefined : mechanism.joints[jointId];
    if (jointId === undefined || joint === undefined) {
      return undefined;
    }
    if (joint.type !== 'fixed') {
      return jointId;
    }
    link = joint.parent;
  }
  return undefined;
}
