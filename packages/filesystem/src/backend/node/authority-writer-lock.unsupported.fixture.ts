const mode = process.argv[2] ?? 'unsupported';
if (mode === 'unsupported') {
  Object.defineProperty(process, 'platform', { value: 'win32' });
} else if (mode === 'electron') {
  Object.defineProperty(process, 'platform', { value: 'linux' });
  Object.defineProperty(process.versions, 'electron', { value: 'test' });
} else {
  Object.defineProperty(process, 'execPath', { value: process.argv[3] });
}

const { acquireNodeAuthorityWriter } = await import('./authority-writer-lock.js');

try {
  const controller = new AbortController();
  if (mode === 'abort-startup') {
    process.once('message', () => {
      controller.abort(new Error('in-flight abort'));
    });
    process.send?.('started');
  }
  await acquireNodeAuthorityWriter({
    authorityRoot: process.argv[4] ?? process.cwd(),
    ...(mode === 'abort-startup' ? { signal: controller.signal } : {}),
  });
  process.send?.({ code: 'UNEXPECTED_SUCCESS' });
} catch (error) {
  process.send?.({
    code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
  });
}
