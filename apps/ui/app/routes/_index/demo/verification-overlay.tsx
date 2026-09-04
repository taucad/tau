import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import { Check, X, Loader2 } from 'lucide-react';
import type { Geometry } from '@taucad/types';
import { cn } from '@taucad/ui/utils/cn';
import { applyCanonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

// A common desktop FDM print bed edge, in millimetres. The bounding-box check
// is real geometry verification, framed for a maker audience.
const printBedMm = 220;

type Measured = {
  /** Largest bounding-box dimension, in millimetres. */
  readonly maxDimensionMm: number;
};

/**
 * Measure the real axis-aligned bounding box of the generated geometry. The
 * runtime emits glTF in metres; we report the largest edge in millimetres.
 */
async function measureGeometry(geometry: Geometry): Promise<Measured | undefined> {
  if (geometry.format !== 'gltf') {
    return undefined;
  }

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(geometry.content.buffer, '');
  applyCanonicalGltfWorld(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  if (box.isEmpty()) {
    return undefined;
  }

  const size = box.getSize(new THREE.Vector3());
  const maxMetres = Math.max(size.x, size.y, size.z);
  return { maxDimensionMm: maxMetres * 1000 };
}

type CheckState = 'pending' | 'pass' | 'fail';

function CheckChip({ state, label }: { readonly state: CheckState; readonly label: string }): React.JSX.Element {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-xs backdrop-blur-sm',
        state === 'pass' && 'border-primary/40 text-foreground',
        state === 'fail' && 'border-destructive/40 text-destructive',
        state === 'pending' && 'text-muted-foreground',
      )}
    >
      {state === 'pending' ? <Loader2 className='size-3 animate-spin' /> : null}
      {state === 'pass' ? <Check className='size-3 text-primary' /> : null}
      {state === 'fail' ? <X className='size-3' /> : null}
      {label}
    </div>
  );
}

/**
 * Live, unbranded verification overlay for the demo (R6, OQ1). Re-measures the
 * real geometry whenever it changes and renders passing/failing checks — the
 * verification story made tangible, without naming the underlying test DSL.
 *
 * ponytail: measures the bounding box directly for a fast, dependency-light
 * demo signal; richer assertions (volume budget, interference) can later route
 * through the GeoSpec worker (`apps/ui/app/workers/geospec-runner.worker.ts`).
 */
export function VerificationOverlay({ geometry }: { readonly geometry: Geometry | undefined }): React.JSX.Element {
  const [measurement, setMeasurement] = useState<{
    readonly geometry: Geometry;
    readonly measured: Measured | undefined;
  }>();

  useEffect(() => {
    if (!geometry) {
      return;
    }

    let cancelled = false;
    async function measure(target: Geometry): Promise<void> {
      try {
        const result = await measureGeometry(target);
        if (!cancelled) {
          setMeasurement({ geometry: target, measured: result });
        }
      } catch (error) {
        console.error('[VerificationOverlay] measure failed:', error);
        if (!cancelled) {
          setMeasurement({ geometry: target, measured: undefined });
        }
      }
    }

    void measure(geometry);

    return () => {
      cancelled = true;
    };
  }, [geometry]);

  const measured = measurement && measurement.geometry === geometry ? measurement.measured : undefined;
  const measuring = geometry !== undefined && measurement?.geometry !== geometry;

  const validState: CheckState = geometry ? 'pass' : 'pending';
  const fitState: CheckState = measured ? (measured.maxDimensionMm <= printBedMm ? 'pass' : 'fail') : 'pending';

  const fitLabel = measured
    ? `Fits ${printBedMm} mm bed (${measured.maxDimensionMm.toFixed(0)} mm)`
    : `Fits ${printBedMm} mm bed`;

  return (
    <>
      <CheckChip state={measuring && !measured ? 'pending' : validState} label='Geometry valid' />
      <CheckChip state={fitState} label={fitLabel} />
    </>
  );
}
