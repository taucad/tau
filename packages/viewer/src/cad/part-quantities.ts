import type { GeometryComponentNode } from '@taucad/types';

/**
 * One inspection vocabulary for the part menu and Properties panel.
 *
 * @public
 */
export type PartQuantity = {
  readonly volumeCm3?: number;
  readonly densityGPerCm3?: number;
  readonly measurement?: 'measuring' | 'failed' | 'open-mesh';
};

/**
 * The measurement state of a part's volume.
 *
 * @public
 */
export type VolumeState = 'ready' | 'measuring' | 'failed' | 'unavailable' | 'not-measured';

/**
 * Resolve the measurement state of a part's volume. A volume counts as ready only when it is finite and not negative.
 *
 * @param quantity - The part's measured quantities.
 * @returns The volume's measurement state.
 * @public
 */
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

/**
 * Format a part's volume in cubic centimetres, or describe why it is not available.
 *
 * @param quantity - The part's measured quantities.
 * @returns The volume label.
 * @public
 */
export function volumeLabel(quantity: PartQuantity): string {
  const state = volumeState(quantity);
  if (state !== 'ready') {
    return stateLabels[state];
  }
  const volume = quantity.volumeCm3;
  return volume === undefined ? 'Not measured' : `${format(volume)} cm³`;
}

/**
 * Format a part's weight in grams from its volume and density, or describe why it is not available.
 *
 * @param quantity - The part's measured quantities.
 * @returns The weight label, or `Unknown` when the density is missing.
 * @public
 */
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

/**
 * Describe the state of a part's volume and weight estimate as a status kind and a sentence.
 *
 * @param quantity - The part's measured quantities.
 * @returns The status kind and the sentence to show.
 * @public
 */
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

/**
 * Name a part's surface material, count its materials when there are several, or say that none are known.
 *
 * @param node - The part's geometry component node.
 * @returns The appearance label.
 * @public
 */
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

/**
 * Combine a part's appearance and, when known, its weight into one label.
 *
 * @param node - The part's geometry component node.
 * @param quantity - The part's measured quantities.
 * @returns The summary label.
 * @public
 */
export function summaryLabel(node: GeometryComponentNode, quantity: PartQuantity): string {
  const appearance = appearanceLabel(node);
  const weight = weightLabel(quantity);
  return volumeState(quantity) === 'ready' && weight !== 'Unknown' ? `${appearance} · ${weight}` : appearance;
}
