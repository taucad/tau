const setupExample = `import { createRuntimeClient } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';

const runtime = defineRuntime({ plugins: [replicad(), esbuild()] });
const client = createRuntimeClient({
  runtime,
  transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
});`;

/** Static reference shown until the dedicated live Replicad preview lane lands. */
export function ReplicadReference(): React.JSX.Element {
  return (
    <section
      aria-labelledby='replicad-static-reference'
      className='not-prose my-8 overflow-hidden rounded-xl border border-border bg-card'
    >
      <div className='border-b border-border px-5 py-4'>
        <p className='font-mono text-xs tracking-widest text-muted-foreground'>STATIC REFERENCE</p>
        <h2 id='replicad-static-reference' className='mt-2 text-lg font-semibold text-card-foreground'>
          Replicad runtime setup
        </h2>
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>
          Live model previews are being moved to this standalone site. The runtime setup remains available here without
          requiring WebGPU.
        </p>
      </div>
      <pre className='overflow-x-auto bg-muted p-5 font-mono text-sm leading-6 text-foreground'>
        <code>{setupExample}</code>
      </pre>
    </section>
  );
}
