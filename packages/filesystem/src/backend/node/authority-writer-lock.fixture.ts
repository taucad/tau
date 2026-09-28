import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';

const root = process.argv[2];
const { send } = process;
if (root === undefined || send === undefined) {
  throw new Error('authority writer fixture requires a root and IPC');
}

const writer = await acquireNodeAuthorityWriter({ authorityRoot: root });
send.call(process, 'ready');
process.stdin.resume();
await new Promise<void>((resolve) => {
  process.stdin.once('end', resolve);
});
await writer.release();
