import { useMemo } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { Separator } from '@taucad/ui/components/separator';
import type { cadMachine } from '#machines/cad.machine.js';
import { inspectGlb } from '#utils/inspect-glb.utils.js';
import type { GltfInspection } from '#utils/inspect-glb.utils.js';

/**
 * `TAU_DEBUG`-gated diagnostic panel below the preview "Downloads" section.
 * Keeps the cross-app e2e contract (counts, asset metadata, scene bounding
 * box) available without putting GLB inspection in the public examples.
 */
type Props = {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
};

const fmt = (n: number): string => (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3));
const vec = (v: readonly [number, number, number]): string => `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;

export function PreviewDebugPanel({ cadRef }: Props): React.JSX.Element {
  const geometry = useSelector(cadRef, (s) => s.context.geometry);

  const inspection = useMemo<GltfInspection | undefined>(() => {
    if (geometry?.format !== 'gltf') {
      return undefined;
    }
    try {
      return inspectGlb(geometry.content);
    } catch {
      return undefined;
    }
  }, [geometry]);

  return (
    <>
      <Separator />
      <div data-testid='preview-debug-panel'>
        <h3 className='mb-3 text-sm font-semibold'>Debug</h3>
        {inspection ? (
          <DebugBody inspection={inspection} />
        ) : (
          <p className='text-xs text-muted-foreground' data-testid='preview-debug-empty'>
            Awaiting first geometry…
          </p>
        )}
      </div>
    </>
  );
}

function DebugBody({ inspection }: { readonly inspection: GltfInspection }): React.JSX.Element {
  const { asset, counts, bbox } = inspection;
  return (
    <div data-testid='bbox-viewer' className='font-mono text-xs text-muted-foreground'>
      <p className='mt-2 mb-1 text-[0.7rem] font-semibold tracking-wide text-foreground uppercase'>Bounding box</p>
      <dl className='grid grid-cols-[5ch_1fr] gap-x-2 gap-y-0.5'>
        <dt>min</dt>
        <dd data-testid='bbox-min'>{vec(bbox.min)}</dd>
        <dt>max</dt>
        <dd data-testid='bbox-max'>{vec(bbox.max)}</dd>
        <dt>size</dt>
        <dd data-testid='bbox-size'>{vec(bbox.size)}</dd>
        <dt>center</dt>
        <dd data-testid='bbox-center'>{vec(bbox.center)}</dd>
      </dl>
      <p className='mt-2 mb-1 text-[0.7rem] font-semibold tracking-wide text-foreground uppercase'>Counts</p>
      <dl className='grid grid-cols-[10ch_1fr] gap-x-2 gap-y-0.5'>
        <dt>meshes</dt>
        <dd data-testid='count-meshes'>{counts.meshes}</dd>
        <dt>primitives</dt>
        <dd data-testid='count-primitives'>{counts.primitives}</dd>
        <dt>vertices</dt>
        <dd data-testid='count-vertices'>{counts.vertices}</dd>
        <dt>triangles</dt>
        <dd data-testid='count-triangles'>{counts.triangles}</dd>
      </dl>
      <p className='mt-2 mb-1 text-[0.7rem] font-semibold tracking-wide text-foreground uppercase'>Asset</p>
      <dl className='grid grid-cols-[10ch_1fr] gap-x-2 gap-y-0.5'>
        <dt>version</dt>
        <dd data-testid='asset-version'>{asset.version}</dd>
        <dt>generator</dt>
        <dd data-testid='asset-generator'>{asset.generator ?? '\u2014'}</dd>
      </dl>
    </div>
  );
}
