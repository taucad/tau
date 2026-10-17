import { openBrowserProjectTaskStorage } from '#browser/project-task-storage.js';

self.addEventListener('message', async () => {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(`task-journal-${Date.now()}`, { create: true });
  const projectId = 'project-opfs-lock';
  const first = await openBrowserProjectTaskStorage(projectId, { kind: 'opfs', directory });
  try {
    await first.append(new TextEncoder().encode('{"sequence":1}\n'));
    let code: unknown;
    try {
      await openBrowserProjectTaskStorage(projectId, { kind: 'opfs', directory });
    } catch (error) {
      code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    }
    await first.close();
    const reopened = await openBrowserProjectTaskStorage(projectId, { kind: 'opfs', directory });
    try {
      const rows = new TextDecoder().decode(await reopened.read());
      self.postMessage({ code, rows });
    } finally {
      await reopened.close();
    }
  } finally {
    await first.close();
  }
});
