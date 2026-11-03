/**
 * The host the E11 qualification row kills (W7; E11, A21): a real Tau agent host over the host registry and the real
 * sandbox provider, scripted to run one `shell` call that counts its own start, then keeps a background writer beating
 * until the process is killed. The row SIGKILLs this process mid-command and judges, from outside, that the writer
 * stops and that recovery over the same durable log records the call `interrupted` without running it again.
 *
 * Configuration arrives in `TAU_CRASH_*` variables set by the row; this process never exits on its own.
 */
import { join } from 'node:path';

import { createTauAgentHost } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import { createSandboxShellProvider } from '@taucad/native-process-core/shell';

import { createHostToolRegistry } from '#agent-tools.js';
import { probeHostShell } from '#shell/shell-service.js';
import { placementOver, scriptedTransport } from '#shell/tau-host.fixture.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const project = required('TAU_CRASH_PROJECT');
const marker = required('TAU_CRASH_MARKER');
const runId = 'run-e11';
const probe = await probeHostShell({
  /*
   * The provider validates that every prepared private root sits directly under its configured session parent (I7),
   * and the service below creates those roots under `TAU_CRASH_SESSIONS`. Both sides must name the same parent, or
   * `prepare` refuses the launch before anything starts.
   */
  provider: createSandboxShellProvider({
    bwrapPath: required('TAU_CRASH_BWRAP'),
    home: required('TAU_CRASH_HOME'),
    custody: {
      directory: join(required('TAU_CRASH_APP_DATA'), 'shell-custody'),
      sessionDirectory: required('TAU_CRASH_SESSIONS'),
    },
  }),
  checkouts: new Map([[runId, { cwd: project, admission: 'admission-e11' }]]),
  appDataRoots: [required('TAU_CRASH_APP_DATA')],
  projectRoots: () => [project],
  home: required('TAU_CRASH_HOME'),
  sessionDirectory: required('TAU_CRASH_SESSIONS'),
});
if (probe.status !== 'available') {
  throw new Error(`the probe refused the shell: ${JSON.stringify(probe)}`);
}
const toolRegistry = createHostToolRegistry({ workspaceRoot: project, shell: probe.shell });
let id = 0;
let tick = 0;
const host = createTauAgentHost({
  systemPrompt: 'You are the shell crash fixture.',
  model: { id: 'scripted-shell-model', contextWindow: 200_000 },
  modelTransport: scriptedTransport([
    {
      toolCalls: [
        {
          id: 'e11-call',
          name: 'shell',
          input: {
            command: `printf 'started\\n' >> data/e11-count.txt; (while :; do date >> data/e11-beat.txt; sleep 0.1; done # ${marker}\n) & sleep 600 # ${marker}`,
            // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the shell tool wire field.
            timeoutMs: 600_000,
          },
        },
      ],
    },
    { text: 'Never reached.' },
  ]),
  toolRegistry,
  placement: placementOver(toolRegistry),
  openEventLog: async () => createNodeEventLog({ filePath: required('TAU_CRASH_LOG'), access: 'write' }),
  createId: () => `e11-${String(id++)}`,
  createLeaderEpoch: () => 'epoch-e11',
  now: () => new Date(Date.UTC(2026, 9, 25, 0, 0, tick++)),
});
process.stdout.write('crash fixture admitting\n');
await host.admit({
  chatId: 'chat-e11',
  runId,
  trigger: 'submit',
  message: { id: 'turn-e11', role: 'user', content: 'Start the long job.' },
});
