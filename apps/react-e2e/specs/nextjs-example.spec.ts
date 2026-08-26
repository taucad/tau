import { test } from 'vitest';
import { expectTargetInspection } from '../support/external-target';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

test('should render Replicad through Next.js 16 Turbopack', async () => {
  expectTargetInspection();
  await expectPublicRuntimeExample({
    successMessage: 'Replicad rendered through @taucad/runtime in a Next.js Turbopack worker.',
  });
});
