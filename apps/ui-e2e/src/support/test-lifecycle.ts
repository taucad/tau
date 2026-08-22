import { aroundEach } from 'vitest';
import { server } from 'vitest/browser';

aroundEach(async (runTest, { annotate }) => {
  await server.commands.uiOpenTarget();
  let failure: unknown;
  try {
    await runTest();
  } catch (error) {
    failure = error;
    const diagnostics = await server.commands.uiCaptureTargetDiagnostics();
    if (diagnostics.screenshot) {
      await annotate('UI E2E target screenshot', {
        body: diagnostics.screenshot,
        bodyEncoding: 'base64',
        contentType: 'image/png',
      });
    }
    await annotate('UI E2E target diagnostics', {
      body: `${JSON.stringify({ ...diagnostics, screenshot: undefined }, null, 2)}\n`,
      // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Vitest's annotation API accepts this spelling.
      bodyEncoding: 'utf-8',
      contentType: 'application/json',
    });
    if (diagnostics.tracePath) {
      await annotate('UI E2E target trace', { contentType: 'application/zip', path: diagnostics.tracePath });
    }
  }

  try {
    await server.commands.uiCloseTarget();
  } catch (cleanupError) {
    if (failure) {
      throw new AggregateError([failure, cleanupError], 'UI E2E test and cleanup both failed.');
    }
    throw cleanupError;
  }
  if (failure) {
    if (failure instanceof Error) {
      throw failure;
    }
    throw new Error('UI E2E test failed with a non-Error value.', { cause: failure });
  }
});
