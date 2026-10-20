import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connect, expectedTools, probeServer } from '#doctor-probe.js';

describe('doctor probe', () => {
  let root: string;

  /** A plugin folder whose `dist/launch.mjs` is `body`. */
  const launcher = (body: string): void => {
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'launch.mjs'), body);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tau-plugin-probe-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('connect', () => {
    it('should fail a request the server never answers, with its stderr', async () => {
      /* A server that started, said something and then answers nothing. */
      launcher("process.stderr.write('listening\\n');\nprocess.stdin.resume();\n");
      const { child, request } = connect(root, [], 2000);
      try {
        await expect(request('initialize', {})).rejects.toThrow('initialize got no answer in 2 s:\nlistening');
      } finally {
        child.kill('SIGKILL');
      }
    });
  });

  describe('probeServer', () => {
    it('should report the server, its identity sentence and the tools it lacks when it has no viewer page', async () => {
      launcher(
        String.raw`let buffer = '';
process.stdin.setEncoding('utf8').on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const { id, method } = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    if (id === undefined) continue;
    const answer = {
      initialize: { result: { serverInfo: { name: '@taucad/mcp', version: '1.2.3' }, instructions: 'Use your native filesystem. Tau CLI 1.2.3 (npx) started by plugin 1.2.3 on Node.js 24.20.0; server @taucad/mcp 1.2.3.' } },
      'tools/list': { result: { tools: [{ name: 'evaluate_model' }] } },
      'resources/list': { error: { code: -32601, message: 'Method not found' } },
    }[method];
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...answer }) + '\n');
  }
});
`,
      );

      const { initializeDuration, ...probe } = await probeServer(root, 5000);

      expect(initializeDuration).toBeGreaterThanOrEqual(0);
      expect(probe).toEqual({
        serverInfo: { name: '@taucad/mcp', version: '1.2.3' },
        identity: 'Tau CLI 1.2.3 (npx) started by plugin 1.2.3 on Node.js 24.20.0; server @taucad/mcp 1.2.3.',
        tools: ['evaluate_model'],
        missingTools: expectedTools.filter((name) => name !== 'evaluate_model'),
        viewer: undefined,
      });
    });

    it('should return the launcher’s exit and stderr when it stops before answering', async () => {
      launcher("process.stderr.write('tau: npm cache /c is not writable\\n');\nprocess.exit(3);\n");

      await expect(probeServer(root, 5000)).resolves.toEqual({
        error: 'the server exited with 3:\ntau: npm cache /c is not writable\n',
      });
    });
  });
});
