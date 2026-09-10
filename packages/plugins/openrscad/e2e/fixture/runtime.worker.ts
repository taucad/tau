/**
 * Runtime worker for the browser fixture.
 *
 * The same two plugins the CLI composes for a `.scad` → USDZ export, wired the
 * way `apps/ui` wires its worker: `@taucad/openrscad` renders GLB and
 * `@taucad/assimp` transcodes it. Both packages are imported by their public
 * names so this bundle resolves exactly what a consumer's bundle would.
 */
import { assimp } from '@taucad/assimp';
import { openrscad } from '@taucad/openrscad';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';

const runtime = defineRuntime({ plugins: [openrscad(), assimp({ preset: 'all' })] });

await webWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
