import { parentPort } from 'node:worker_threads';
import { executeCodeInNode } from '#node-module-execution.js';

if (!parentPort) {
  throw new Error('node-module-execution test worker requires a parent port');
}

const { entryUrl } = await executeCodeInNode('export const value = 42;');
parentPort.postMessage(entryUrl);
