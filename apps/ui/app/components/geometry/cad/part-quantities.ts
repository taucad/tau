import type { GeometryComponentNode } from '@taucad/types';
import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadPhysical, TauCadTopologyComponent } from '@taucad/geometry-core';

/** One inspection vocabulary for the part menu and Properties panel. */
export type PartQuantity = {
  readonly volumeCm3?: number;
  readonly densityGPerCm3?: number;
  readonly measurement?: 'measuring' | 'failed' | 'open-mesh';
};

/** Physical facts and their geometry revision, kept separate from preview appearance. */
export type PartInspection = {
  readonly quantity: PartQuantity;
  readonly physical?: TauCadPhysical;
  readonly basis: 'current' | 'last-committed' | 'unavailable';
};

/** A transient preview may display only the matching last-committed component's facts. */
export function projectPartInspection({
  node,
  committedNode,
  transientPreview = false,
}: {
  readonly node: GeometryComponentNode;
  readonly committedNode?: GeometryComponentNode;
  readonly transientPreview?: boolean;
}): PartInspection {
  if (transientPreview && (!committedNode || committedNode.id !== node.id || committedNode.kind !== node.kind)) {
    return { quantity: {}, basis: 'unavailable' };
  }
  const physical = transientPreview ? committedNode?.physical : node.physical;
  return {
    quantity: quantityFromPhysical(physical),
    ...(physical === undefined ? {} : { physical }),
    basis: transientPreview ? 'last-committed' : 'current',
  };
}

export type VolumeState = 'ready' | 'measuring' | 'failed' | 'unavailable' | 'not-measured';

/** Project validated native mm³ and authored g/cm³ without rounding the quantity. */
export function quantityFromPhysical(physical?: TauCadPhysical, expectedGeometryDigest?: string): PartQuantity {
  if (!physical) {
    return {};
  }
  if (
    validateTauCadTopology(
      {
        schemaVersion: 1,
        components: [{ id: 'inspection', name: 'inspection', kind: 'part', selector: 'inspection', physical }],
      },
      { nodes: [], meshes: [] },
    ).length > 0
  ) {
    return { measurement: 'failed' };
  }
  const { volume, density } = physical;
  const authoredDensity = density
    ? {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing API field uses cm³ notation.
        densityGPerCm3: density.valueGPerCm3,
      }
    : {};
  if (volume.state === 'unavailable') {
    return { ...authoredDensity, measurement: volume.reason === 'not-solid' ? 'open-mesh' : 'failed' };
  }
  if (expectedGeometryDigest !== undefined && volume.geometryDigest !== expectedGeometryDigest) {
    return {};
  }
  return {
    volumeCm3: volume.valueMm3 / 1000,
    ...authoredDensity,
  };
}

/** Full-precision estimated mass. Display rounding happens only in weightLabel. */
export function estimatedMassG(quantity: PartQuantity): number | undefined {
  const { volumeCm3, densityGPerCm3: density } = quantity;
  if (
    volumeState(quantity) !== 'ready' ||
    volumeCm3 === undefined ||
    density === undefined ||
    !Number.isFinite(density) ||
    density <= 0
  ) {
    return undefined;
  }
  const mass = volumeCm3 * density;
  return Number.isFinite(mass) ? mass : undefined;
}

/** Count each selected leaf once, including when its ancestor is also selected. */
export function summarizePartQuantities(
  components: ReadonlyArray<Pick<TauCadTopologyComponent, 'id' | 'kind' | 'parentId' | 'childIds' | 'physical'>>,
  selectedIds?: readonly string[],
): {
  readonly knownMassG: number;
  readonly knownCount: number;
  readonly totalCount: number;
  readonly unknownIds: string[];
} {
  const parents = new Map<string, string>();
  for (const component of components) {
    if (component.parentId) {
      parents.set(component.id, component.parentId);
    }
    for (const childId of component.childIds ?? []) {
      parents.set(childId, component.id);
    }
  }
  const partIds = new Set(components.filter(({ kind }) => kind === 'part').map(({ id }) => id));
  const nonLeafParts = new Set<string>();
  for (const partId of partIds) {
    let ancestor = parents.get(partId);
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor)) {
      visited.add(ancestor);
      if (partIds.has(ancestor)) {
        nonLeafParts.add(ancestor);
      }
      ancestor = parents.get(ancestor);
    }
  }
  const selected = selectedIds ? new Set(selectedIds) : undefined;
  const unknownIds: string[] = [];
  let knownMassG = 0;
  let knownCount = 0;
  let totalCount = 0;
  for (const component of components) {
    if (component.kind !== 'part' || nonLeafParts.has(component.id)) {
      continue;
    }
    if (selected) {
      let id: string | undefined = component.id;
      const visited = new Set<string>();
      while (id && !selected.has(id) && !visited.has(id)) {
        visited.add(id);
        id = parents.get(id);
      }
      if (!id || !selected.has(id)) {
        continue;
      }
    }
    totalCount++;
    const mass = estimatedMassG(quantityFromPhysical(component.physical));
    if (mass === undefined) {
      unknownIds.push(component.id);
    } else {
      knownMassG += mass;
      knownCount++;
    }
  }
  return { knownMassG, knownCount, totalCount, unknownIds };
}

export function volumeState(quantity: PartQuantity): VolumeState {
  if (quantity.measurement === 'measuring') {
    return 'measuring';
  }
  if (quantity.measurement === 'failed') {
    return 'failed';
  }
  if (quantity.measurement === 'open-mesh') {
    return 'unavailable';
  }
  return quantity.volumeCm3 !== undefined && Number.isFinite(quantity.volumeCm3) && quantity.volumeCm3 >= 0
    ? 'ready'
    : 'not-measured';
}

const stateLabels: Record<Exclude<VolumeState, 'ready'>, string> = {
  measuring: 'Measuring…',
  failed: 'Unavailable',
  unavailable: 'Unavailable',
  'not-measured': 'Not measured',
};

const format = (value: number): string => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);

/** An authored density is distinct from an appearance material. */
export function densityLabel(quantity: PartQuantity): string {
  const density = quantity.densityGPerCm3;
  return density === undefined || !Number.isFinite(density) || density <= 0 ? 'Unknown' : `${format(density)} g/cm³`;
}

/** Label a known aggregate subtotal without implying missing parts weigh zero. */
export function knownMassLabel(massG: number): string {
  return `${format(massG)} g`;
}

export function volumeLabel(quantity: PartQuantity): string {
  const state = volumeState(quantity);
  if (state !== 'ready') {
    return stateLabels[state];
  }
  const volume = quantity.volumeCm3;
  return volume === undefined ? 'Not measured' : `${format(volume)} cm³`;
}

export function weightLabel(quantity: PartQuantity): string {
  const state = volumeState(quantity);
  if (state !== 'ready') {
    return stateLabels[state];
  }
  const mass = estimatedMassG(quantity);
  return mass === undefined ? 'Unknown' : `${format(mass)} g`;
}

export function statusOf(quantity: PartQuantity): {
  readonly kind: 'ready' | 'busy' | 'info' | 'failed';
  readonly sentence: string;
} {
  switch (volumeState(quantity)) {
    case 'measuring': {
      return { kind: 'busy', sentence: 'Measuring volume…' };
    }
    case 'failed': {
      return { kind: 'failed', sentence: 'Measurement failed.' };
    }
    case 'unavailable': {
      return { kind: 'info', sentence: 'Open mesh: no enclosed volume.' };
    }
    case 'not-measured': {
      return { kind: 'info', sentence: 'Volume not measured yet.' };
    }
    case 'ready': {
      return weightLabel(quantity) === 'Unknown'
        ? { kind: 'info', sentence: 'Weight needs a material density.' }
        : { kind: 'ready', sentence: 'Estimate from volume × density.' };
    }
  }
}

export function appearanceLabel(node: GeometryComponentNode): string {
  const materials = node.appearance?.materials;
  if (!materials?.length) {
    return 'Appearance unavailable';
  }
  if (materials.length > 1) {
    return `${materials.length} surface materials`;
  }
  const name = materials[0]?.name;
  return typeof name === 'string' ? name.trim() || 'Unnamed material' : 'Unnamed material';
}

export function summaryLabel(node: GeometryComponentNode, quantity: PartQuantity): string {
  const appearance = appearanceLabel(node);
  const weight = weightLabel(quantity);
  return volumeState(quantity) === 'ready' && weight !== 'Unknown' ? `${appearance} · ${weight}` : appearance;
}
