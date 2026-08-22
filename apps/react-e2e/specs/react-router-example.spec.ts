import { test } from 'vitest';
import { expectTargetInspection } from '../support/external-target';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

test('should render Replicad through React Router 8 and Vite 8', async () => {
  expectTargetInspection();
  await expectPublicRuntimeExample({
    successMessage: 'Replicad rendered through @taucad/runtime in a React Router Vite worker.',
  });
});
