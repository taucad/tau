import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime-definition';
import { BrowserCancellationHarness } from '../../../support/browser-cancellation-harness';
import { RuntimeFixture } from '../../../support/runtime-fixture';
import type { RuntimeFixtureOptions } from '../../../support/runtime-fixture';
import { cylinderSource, mainFile } from '../../../support/replicad-cylinder';

const createWorker = (): Worker =>
  new Worker(new URL('runtime.worker.ts', import.meta.url), {
    name: 'tau-react-e2e-react-router',
    type: 'module',
  });

const clientOptions = createWebWorkerClientOptions<typeof runtime>({
  createWorker,
  renderTimeout: 60_000,
});
const runtimeOptions = {
  clientOptions,
  initialParameters: { radius: 10, height: 24 },
  source: { files: { [mainFile]: cylinderSource } },
} satisfies RuntimeFixtureOptions<typeof runtime>;

export function RuntimeClient(): React.ReactNode {
  return (
    <>
      <RuntimeFixture<typeof runtime> options={runtimeOptions} />
      <BrowserCancellationHarness createWorker={createWorker} />
    </>
  );
}
