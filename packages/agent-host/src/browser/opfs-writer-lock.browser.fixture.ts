import { createOpfsEventLog } from '#browser.js';

/* CL-A8 (OPFS leg): the second writer on one chat log meets the first's exclusive sync handle. */
globalThis.addEventListener('message', async () => {
  const root = await navigator.storage.getDirectory();
  const fileName = 'agent-host-writer-lock-test.jsonl';
  try {
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const first = await createOpfsEventLog({ fileHandle, access: 'write' });
    let code: unknown;
    try {
      const second = await createOpfsEventLog({ fileHandle, access: 'write' });
      await second.close();
    } catch (error) {
      code = (error as { readonly code?: unknown }).code;
    }
    await first.close();
    const reopened = await createOpfsEventLog({ fileHandle, access: 'write' });
    await reopened.close();
    globalThis.postMessage({ code, reopened: true });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    await root.removeEntry(fileName).catch(() => undefined);
  }
});
