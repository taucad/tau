import type { GeometryComponentNode } from '@taucad/types';

/** One inspection vocabulary for the part menu and Properties panel. */
export type PartQuantity = {
  readonly volumeCm3?: number;
  readonly densityGPerCm3?: number;
  readonly measurement?: 'measuring' | 'failed' | 'open-mesh';
};

export type VolumeState = 'ready' | 'measuring' | 'failed' | 'unavailable' | 'not-measured';

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
  const density = quantity.densityGPerCm3;
  const volume = quantity.volumeCm3;
  return volume !== undefined && density !== undefined && Number.isFinite(density) && density > 0
    ? `${format(volume * density)} g`
    : 'Unknown';
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
