import { aroundEach } from 'vitest';
import { commands } from '#support/external-target.js';

aroundEach(async (runTest, { task }) => {
  await commands.uiOpenTarget();
  const [body] = await Promise.allSettled([Promise.resolve().then(async () => runTest())]);
  const [capture] = await Promise.allSettled([
    (async (): Promise<void> => {
      if (body.status === 'rejected' || task.result?.state === 'fail') {
        await commands.uiCaptureTargetDiagnostics();
      }
    })(),
  ]);
  const [cleanup] = await Promise.allSettled([Promise.resolve().then(async () => commands.uiCloseTarget())]);
  const failures: unknown[] = [body, capture, cleanup].flatMap((result): unknown[] =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 1) {
    throw new AggregateError(failures, 'UI E2E test, diagnostics or cleanup failed.');
  }
  if (failures.length === 1) {
    const [failure] = failures;
    if (failure instanceof Error) {
      throw failure;
    }
    throw new Error('UI E2E test failed with a non-Error value.', { cause: failure });
  }
});
