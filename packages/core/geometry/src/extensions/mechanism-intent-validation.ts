import { admitMechanism, listDegreesOfFreedom, validateMechanismMotion } from '@taucad/kinematics';
import type { SpatialMatrix } from '@taucad/spatial';
import type { TauCadTopologyPayload } from '#extensions/tau-cad-topology.types.js';

const rigid = (matrix: SpatialMatrix): boolean => {
  if (!matrix.every((value) => Number.isFinite(value))) {
    return false;
  }
  if ([matrix[3], matrix[7], matrix[11], matrix[15] - 1].some((value) => Math.abs(value) > 1e-8)) {
    return false;
  }
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let product = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        product += matrix[row * 4 + axis]! * matrix[column * 4 + axis]!;
      }
      if (Math.abs(product - (row === column ? 1 : 0)) > 1e-8) {
        return false;
      }
    }
  }
  return (
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
      matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) +
      matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]) >
    0
  );
};

const rigidBodyIssues = (payload: TauCadTopologyPayload): string[] => {
  const issues: string[] = [];
  const byId = new Set(payload.components.map(({ id }) => id));
  const bodyMembers = new Set<string>();
  for (const [body, members] of Object.entries(payload.mechanismIntent?.rigidBodies ?? {})) {
    if (!byId.has(body)) {
      issues.push(`mechanismIntent rigid body ${body} references missing component`);
    }
    for (const member of members) {
      if (!byId.has(member)) {
        issues.push(`mechanismIntent rigid body ${body} references missing member ${member}`);
      }
      if (bodyMembers.has(member)) {
        issues.push(`mechanismIntent rigid body member ${member} is assigned more than once`);
      }
      bodyMembers.add(member);
    }
    if (payload.mechanism !== undefined) {
      const link = Object.hasOwn(payload.mechanism.links, body) ? payload.mechanism.links[body] : undefined;
      const compiledMembers = new Set(link?.components);
      if (
        link === undefined ||
        members.length !== compiledMembers.size ||
        members.some((member) => !compiledMembers.has(member))
      ) {
        issues.push(`mechanismIntent rigid body ${body} membership differs from its playback link`);
      }
    }
  }
  return issues;
};

/**
 * Validate physical interface frames, endpoint references and occurrence containment.
 * @param payload - Structurally validated topology payload.
 * @returns Semantic conformance failures.
 */
export const mechanismIntentIssues = (payload: TauCadTopologyPayload): string[] => {
  const issues: string[] = [];
  const byId = new Map(payload.components.map((component) => [component.id, component]));
  const children = new Map<string, Set<string>>();
  const append = (parent: string, child: string): void => {
    const entries = children.get(parent) ?? new Set<string>();
    entries.add(child);
    children.set(parent, entries);
  };
  for (const component of payload.components) {
    if (component.parentId !== undefined) {
      append(component.parentId, component.id);
    }
    for (const child of component.childIds ?? []) {
      append(component.id, child);
    }
    if (component.placement !== undefined && !rigid(component.placement)) {
      issues.push(`${component.id} placement must be a proper rigid frame`);
    }
    for (const [name, endpoint] of Object.entries(component.jointInterfaceAliases ?? {})) {
      const target = byId.get(endpoint.componentId);
      if (!target || !Object.hasOwn(target.jointInterfaces ?? {}, endpoint.interfaceId)) {
        issues.push(`${component.id} alias ${name} references a missing local interface`);
      }
      const ancestors = new Set<string>();
      let parentId = target?.parentId;
      while (parentId !== undefined && !ancestors.has(parentId)) {
        ancestors.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
      if (!ancestors.has(component.id)) {
        issues.push(`${component.id} alias ${name} must refer to a descendant`);
      }
    }
    for (const [name, entry] of Object.entries(component.jointInterfaces ?? {})) {
      if (!rigid(entry.frame) || (entry.referenceFrame !== undefined && !rigid(entry.referenceFrame))) {
        issues.push(`${component.id} interface ${name} must have proper rigid frames`);
      }
      if (
        entry.angleReference !== undefined &&
        (!entry.angleReference.every((value) => Number.isFinite(value)) || Math.hypot(...entry.angleReference) < 1e-12)
      ) {
        issues.push(`${component.id} interface ${name} has an invalid angle reference`);
      }
      if (entry.chart !== undefined && entry.kind !== 'spherical') {
        issues.push(`${component.id} interface ${name} chart applies only to spherical joints`);
      }
      const allowed =
        entry.kind === 'spherical'
          ? ['x', 'y', 'z']
          : entry.kind === 'fixed'
            ? []
            : entry.kind === 'revolute'
              ? ['angle']
              : entry.kind === 'prismatic'
                ? ['distance']
                : ['angle', 'distance'];
      for (const [coordinate, bounds] of Object.entries(entry.ranges ?? {})) {
        if (!allowed.includes(coordinate)) {
          issues.push(`${component.id} interface ${name} has an unknown range ${coordinate}`);
        }
        if (
          (bounds.lower !== undefined && !Number.isFinite(bounds.lower)) ||
          (bounds.upper !== undefined && !Number.isFinite(bounds.upper)) ||
          (bounds.lower ?? -Infinity) > (bounds.upper ?? Infinity)
        ) {
          issues.push(`${component.id} interface ${name} range ${coordinate} is invalid`);
        }
      }
    }
  }
  // Iterative colour DFS is bounded by component count, including hostile cyclic input.
  const visited = new Set<string>();
  const active = new Set<string>();
  for (const id of byId.keys()) {
    const stack: Array<readonly [string, boolean]> = [[id, false]];
    while (stack.length > 0) {
      const [current, exiting] = stack.pop()!;
      if (exiting) {
        active.delete(current);
        visited.add(current);
        continue;
      }
      if (active.has(current)) {
        issues.push(`${current} lies on a component hierarchy cycle`);
        continue;
      }
      if (visited.has(current)) {
        continue;
      }
      active.add(current);
      stack.push([current, true]);
      for (const child of children.get(current) ?? []) {
        stack.push([child, false]);
      }
    }
  }
  const intent = payload.mechanismIntent;
  if (intent === undefined) {
    return issues;
  }
  if (intent.ground !== undefined && !byId.has(intent.ground)) {
    issues.push(`mechanismIntent ground references missing component ${intent.ground}`);
  }
  issues.push(...rigidBodyIssues(payload));
  const admitted = payload.mechanism === undefined ? undefined : admitMechanism(payload.mechanism);
  const dofs =
    admitted?.status === 'admitted' ? new Set(listDegreesOfFreedom(admitted.mechanism).map(({ id }) => id)) : undefined;
  if (
    payload.mechanism !== undefined &&
    (payload.mechanism.units.length !== intent.units.length || payload.mechanism.units.angle !== intent.units.angle)
  ) {
    issues.push('mechanismIntent and playback mechanism units must agree');
  }
  for (const issue of validateMechanismMotion({
    coordinates: intent.connections.flatMap((connection) => Object.values(connection.playbackCoordinates ?? {})),
    couplings: intent.couplings,
    animations: intent.animations,
  })) {
    issues.push(`mechanismIntent${issue.path}: ${issue.message}`);
  }
  const ids = new Set<string>();
  for (const connection of intent.connections) {
    if (ids.has(connection.id)) {
      issues.push(`mechanismIntent connection ${connection.id} is duplicated`);
    }
    ids.add(connection.id);
    for (const endpoint of [connection.parent, connection.child]) {
      const component = byId.get(endpoint.componentId);
      if (!component || !Object.hasOwn(component.jointInterfaces ?? {}, endpoint.interfaceId)) {
        issues.push(
          `mechanismIntent connection ${connection.id} references missing interface ${endpoint.componentId}/${endpoint.interfaceId}`,
        );
      }
    }
    for (const id of Object.values(connection.playbackCoordinates ?? {})) {
      if (dofs !== undefined && !dofs.has(id)) {
        issues.push(`mechanismIntent connection ${connection.id} references missing playback coordinate ${id}`);
      }
    }
    for (const [coordinate, value] of Object.entries(connection.referenceCoordinates ?? {})) {
      if (!Number.isFinite(value)) {
        issues.push(`mechanismIntent connection ${connection.id} reference ${coordinate} is not finite`);
      }
    }
  }
  if (payload.mechanism === undefined && intent.connections.length > 0 && !payload.mechanismDiagnostics?.length) {
    issues.push('mechanismIntent requires playback or an explicit unsupported diagnostic');
  }
  return issues;
};
