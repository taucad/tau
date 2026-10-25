import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';

const root = process.argv[2];
const mode = process.argv[3] ?? 'hold';
const { send } = process;
if (root === undefined || send === undefined) {
  throw new Error('authority writer fixture requires a root and IPC');
}

if (mode === 'race') {
  send.call(process, 'waiting');
  await new Promise<void>((resolve) => {
    process.once('message', () => {
      resolve();
    });
  });
}

try {
  const writer = await acquireNodeAuthorityWriter({ authorityRoot: root });
  if (mode === 'probe') {
    await writer.assertCurrent();
    await writer.release();
    send.call(process, { status: 'acquired-and-released' });
    process.disconnect();
  } else {
    send.call(process, 'ready');
    process.stdin.resume();
    await new Promise<void>((resolve) => {
      process.stdin.once('end', resolve);
    });
    await writer.release();
  }
} catch (error) {
  send.call(process, {
    name: error instanceof Error ? error.name : 'Unknown',
    code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
  });
  process.disconnect();
}
