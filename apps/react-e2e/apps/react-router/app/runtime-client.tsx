import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime-definition';
import { RuntimeFixture } from '../../../support/RuntimeFixture';

const clientOptions = createWebWorkerClientOptions<typeof runtime>({
  createWorker: () =>
    new Worker(new URL('./runtime.worker.ts', import.meta.url), {
      name: 'tau-react-e2e-react-router',
      type: 'module',
    }),
  renderTimeout: 60_000,
});

export function RuntimeClient(): React.ReactNode {
  return <RuntimeFixture<typeof runtime> clientOptions={clientOptions} />;
}
