// Records every parent message after `start` into the file named by argv[2], so a test can see what the supervisor posted.
// `disconnect` drops the IPC channel and exits a moment later, as a child whose channel broke before it died.
import { appendFileSync } from 'node:fs';

const outputPath = process.argv[2];
process.on('message', (message) => {
  if (message?.type === 'start') {
    process.send?.({ type: 'ready', url: 'ws://127.0.0.1:9', runtimeVersion: 'message-echo' });
    return;
  }
  if (message?.type === 'disconnect') {
    process.disconnect();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  if (message?.type === 'close') {
    process.exit(0);
  }
  appendFileSync(outputPath, `${JSON.stringify(message)}\n`);
});
