import process from 'node:process';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';

const authorityRoot = process.argv[2];
if (!process.versions.electron || process.type !== 'utility' || !authorityRoot) {
  throw new Error('Real Electron utility process and authority root required');
}
const port = process.parentPort;
try {
  const writer = await acquireNodeAuthorityWriter({ authorityRoot });
  const keepAlive = globalThis.setInterval(() => {
    // Keep this fixture utility alive until explicitly released or force-killed.
  }, 1000);
  try {
    const releaseRequested = Promise.withResolvers<void>();
    port.on('message', ({ data }) => {
      if (data === 'release') {
        releaseRequested.resolve();
      } else {
        releaseRequested.reject(new Error('Unexpected authority fixture command'));
      }
    });
    port.postMessage({ status: 'owned', electron: process.versions.electron, type: process.type });
    await releaseRequested.promise;
    await Promise.all([writer.release(), writer.release()]);
    port.postMessage({ status: 'released' });
  } finally {
    globalThis.clearInterval(keepAlive);
    await writer.release();
  }
} catch (error) {
  port.postMessage({ status: 'refused', code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN' });
}
