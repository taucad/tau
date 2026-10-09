import { getEventListeners } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { componentValue, parseMachineProvider } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineCommandReceipt,
  MachineConnectionRuntime,
  MachineReport,
  MachineSession,
} from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import type { CarveraSubmission } from '#carvera.manifest.js';
import { createCarveraSimulator, defineCarveraSimulatorMachine } from '#carvera.simulator.js';
import type { CarveraSimulator } from '#carvera.simulator.js';

/** A pocket that runs about a minute on the machine: 4 passes of a 60 × 40 mm rectangle. */
const program = [
  'G90 G21 G54',
  'T1 M6',
  'S10000 M3',
  'G0 X0 Y0 Z5',
  ...Array.from({ length: 4 }, (_, pass) => [
    `G1 Z${String(-0.5 * (pass + 1))} F300`,
    'G1 X60 F1200',
    'G1 Y40',
    'G1 X0',
    'G1 Y0',
  ]).flat(),
  'G0 Z5',
  'M5',
  'M30',
].join('\n');

const artifact: MachineArtifactReference = {
  projectId: 'proj_abcdefghijklmnopqrstu',
  path: 'cam/pocket.nc',
  digest: `sha256:${'ab'.repeat(32)}` as MachineArtifactReference['digest'],
  length: program.length,
  mediaType: 'text/x.gcode',
  contract: { id: 'tau.toolpath.gcode', version: 1 },
  selectedMember: '',
};

const runtimeFor = (text: string): MachineConnectionRuntime => ({
  clock: { now: () => new Date().toISOString() },
  log: async () => undefined,
  connectStream: async () => {
    throw new Error('The simulator opens no sockets.');
  },
  async *readArtifact() {
    yield new TextEncoder().encode(text);
  },
  resolveSecret: async () => '',
});

const opened: Array<{ session: MachineSession<CarveraSubmission>; simulator: CarveraSimulator }> = [];
afterEach(async () => {
  await Promise.all(
    opened.splice(0).map(async ({ session, simulator }) => {
      await session.close();
      simulator.dispose();
    }),
  );
});

const connect = async (simulator = createCarveraSimulator({ speed: 25, tickInterval: 10 }), text = program) => {
  const definition = await resolveRuntimePluginDefinition(
    'machine',
    defineCarveraSimulatorMachine({ simulator, pollInterval: 40 })(),
  );
  const session = await definition.connect(
    {
      candidate: {
        id: 'carvera-simulator',
        name: 'Simulated Carvera',
        endpoint: { address: 'simulator.invalid', interface: 'simulator' },
        claimedIdentity: { model: 'Carvera' },
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      configuration: { speed: 25 },
      connection: { secretRef: 'none', serviceTrust: {} },
      signal: new AbortController().signal,
    },
    runtimeFor(text),
  );
  opened.push({ session, simulator });
  if (session.actions.type !== 'supported' || session.jobs.type !== 'supported' || session.jobs.delivery !== 'stored') {
    throw new Error('The simulator supports actions and stored jobs.');
  }
  const { actions, jobs } = session;
  let operations = 0;

  const waitFor = async (
    holds: (report: MachineReport) => boolean,
    what: string,
    deadline = 20_000,
  ): Promise<MachineReport> => {
    return vi.waitFor(
      async () => {
        const report = await session.getSnapshot({ signal: new AbortController().signal });
        if (!holds(report)) {
          throw new Error(`Still waiting for ${what}: ${JSON.stringify(report.state)}`);
        }
        return report;
      },
      { timeout: deadline, interval: 20 },
    );
  };

  /** Apply one action and wait for the machine's reports to settle it. */
  // oxlint-disable-next-line eslint/max-params -- a test step reads best positionally.
  const act = async (componentId: string, action: string, parameters: unknown = {}, by: 'user' | 'agent' = 'user') => {
    operations += 1;
    const operationId = `op-${String(operations)}`;
    const report = await session.getSnapshot({ signal: new AbortController().signal });
    const input = {
      operationId,
      componentId,
      action,
      version: 1,
      expectedRunId: report.run?.runId ?? null,
      parameters,
    };
    const receipt = await actions.apply({ ...input, requestedBy: { kind: by }, signal: new AbortController().signal });
    const settled = async () => {
      try {
        return await vi.waitFor(
          () => {
            const answer = actions.confirm(input);
            if (answer.status === 'pending') {
              throw new Error('Still pending.');
            }
            return answer;
          },
          { timeout: 20_000, interval: 20 },
        );
      } catch {
        return actions.confirm(input);
      }
    };
    return { operationId, receipt, settled };
  };

  const job = (operationId: string, configuration: CarveraSubmission) => ({
    operationId,
    expectedMachineId: 'carvera-simulator',
    artifact,
    configuration,
    signal: new AbortController().signal,
  });

  /** Prepare a job; this machine always names the file it will store. */
  const prepareStored = async (operationId: string, configuration: CarveraSubmission) => {
    const prepared = await jobs.prepare(job(operationId, configuration));
    if (prepared.status === 'refused' || prepared.remoteName === undefined) {
      throw new Error(`Not prepared: ${JSON.stringify(prepared)}`);
    }
    return { ...prepared, remoteName: prepared.remoteName };
  };

  /** Prepare, upload and start one job. */
  const runJob = async (configuration: CarveraSubmission) => {
    const prepared = await prepareStored('prepare-1', configuration);
    const transfer = await jobs.transfer({
      ...job('transfer-1', configuration),
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    const start = await jobs.start({
      ...job('start-1', configuration),
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    return { prepared, transfer, start };
  };

  return { session, simulator, actions, jobs, waitFor, act, job, prepareStored, runJob };
};

const ready = (report: MachineReport): boolean =>
  report.connection === 'connected' &&
  report.state.status === 'ready' &&
  componentValue(report.components, 'motion', 'motion')?.trust === 'homed';

const options: CarveraSubmission = { workOffset: 'G54', scanMargin: true, probeZ: true, level: { enabled: false } };
const plain: CarveraSubmission = { ...options, scanMargin: false, probeZ: false };

describe('carvera simulator through the real session', () => {
  it('should declare a simulation profile that qualifies every action and hold', async () => {
    const provider = parseMachineProvider(defineCarveraSimulatorMachine()());
    expect(provider.manifest.qualifications.map(({ id, environment }) => [id, environment])).toEqual([
      ['carvera-simulation', 'simulation'],
    ]);
    for (const control of [...provider.manifest.actions, ...provider.manifest.holds]) {
      expect(control.qualification).toEqual({ status: 'qualified', profileId: 'carvera-simulation' });
    }
  });

  it(
    'should wake, home, probe, change tools and run a job through pause, resume and cancel',
    { timeout: 120_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');

      // Asleep at the machine: wake restarts it, the link drops and comes back, and it homes by itself.
      machine.simulator.sleep();
      await machine.waitFor((report) => report.state.status === 'asleep', 'sleep');
      const wake = await machine.act('controller', 'controller.wake');
      expect(wake.receipt.status).toBe('accepted');
      expect(await wake.settled()).toEqual({ status: 'confirmed' });
      await machine.waitFor(ready, 'homing after the restart');

      const home = await machine.act('motion', 'motion.home');
      expect(home.receipt.status === 'accepted' && home.receipt.activityId?.startsWith('homing-')).toBe(true);
      expect(await home.settled()).toEqual({ status: 'confirmed' });

      // Over the stock, then probe its top with T0 and put T1 back.
      const over = await machine.act('motion', 'motion.move', {
        frame: 'machine',
        position: { x: -220, y: -150, z: -100 },
      });
      expect(await over.settled()).toEqual({ status: 'confirmed' });
      const probe = await machine.act('probe', 'probe.run', { cycle: 'z-surface' });
      expect(await probe.settled()).toEqual({ status: 'confirmed' });
      const probed = await machine.session.getSnapshot({ signal: new AbortController().signal });
      expect(componentValue(probed.components, 'tools', 'tools')?.current).toBe(1);
      expect(probed.activities.find((activity) => activity.kind === 'probing')).toMatchObject({
        state: 'succeeded',
        steps: [{ state: 'done' }, { state: 'done' }, { state: 'done' }],
      });
      expect(machine.simulator.commands()).toEqual(
        expect.arrayContaining(['M6 T0', 'G91 G38.2 Z-30 F150', 'G10 L20 P0 Z0', 'M6 T1']),
      );

      const change = await machine.act('tools', 'tool.change', { tool: 3 });
      expect(await change.settled()).toEqual({ status: 'confirmed' });
      const back = await machine.act('tools', 'tool.change', { tool: 1 });
      expect(await back.settled()).toEqual({ status: 'confirmed' });

      // The job: prepare, upload with MD5, then play behind the before-program automation.
      const prepared = await machine.prepareStored('prepare-1', options);
      expect(prepared.status).toBe('ready');
      expect(prepared.program.facts).toMatchObject({
        process: 'milling',
        lines: 27,
        tools: [{ number: 1 }],
        workOffsets: ['G54'],
      });
      expect(prepared.checks.map(({ id, state }) => [id, state])).toEqual([
        ['idle', 'passed'],
        ['homed', 'passed'],
        ['cover', 'passed'],
        ['estop', 'passed'],
        ['rack', 'passed'],
        ['line-length', 'passed'],
        ['travel', 'passed'],
        ['probe', 'passed'],
      ]);
      const transfer = await machine.jobs.transfer({
        ...machine.job('transfer-1', options),
        remoteName: prepared.remoteName,
        providerData: prepared.providerData,
      });
      expect(transfer.status === 'accepted' && transfer.transferId?.startsWith(`${prepared.remoteName}@`)).toBe(true);
      expect(machine.simulator.files()).toEqual([prepared.remoteName]);
      const start = await machine.jobs.start({
        ...machine.job('start-1', options),
        remoteName: prepared.remoteName,
        providerData: prepared.providerData,
      });
      expect(start).toMatchObject({ status: 'accepted', runId: 'tau-start-1' });
      expect(machine.simulator.commands()).toEqual(
        expect.arrayContaining([
          'buffer G54',
          'buffer M495 X0.000 Y0.000 C60.000 D40.000 O5 F5',
          'buffer M6 T1',
          `play ${prepared.remoteName}`,
        ]),
      );
      const before = await machine.waitFor(
        (report) =>
          report.run !== undefined && report.activities.some((activity) => activity.kind === 'before-program'),
        'the automation',
      );
      expect(before.run).toMatchObject({ runId: 'tau-start-1', origin: 'tau', delivery: 'stored' });
      const cutting = await machine.waitFor(
        (report) => (report.run?.progress.counters[0]?.current ?? 0) > 8,
        'the program to cut',
      );
      expect(cutting.activities.find((activity) => activity.kind === 'before-program')?.state).toBe('succeeded');

      // Pause drains the queue first and leaves the spindle turning.
      const pause = await machine.act('controller', 'run.pause');
      expect(await pause.settled()).toEqual({ status: 'confirmed' });
      const paused = await machine.waitFor((report) => report.run?.state === 'paused', 'the pause');
      expect(paused.state).toMatchObject({ status: 'held', native: 'Pause' });
      expect(paused.run?.paused).toEqual({ by: 'person', reason: 'Paused from Tau' });
      expect(componentValue(paused.components, 'spindle', 'spindle')?.mode).toBe('clockwise');
      expect(machine.simulator.queued()).toBe(0);

      const resume = await machine.act('controller', 'run.resume');
      expect(await resume.settled()).toEqual({ status: 'confirmed' });
      await machine.waitFor((report) => report.run?.state === 'running', 'the resume');

      // Stop job (abort): the queued moves still run, then the run disappears and Tau knows it cancelled it.
      const cancel = await machine.act('controller', 'run.cancel');
      expect(cancel.receipt.status).toBe('accepted');
      const finishing = await machine.session.getSnapshot({ signal: new AbortController().signal });
      expect(finishing.run).toMatchObject({
        state: 'finishing',
        stage: 'Running the queued moves, then stopping the spindle',
      });
      expect(await cancel.settled()).toEqual({ status: 'confirmed' });
      const cancelled = await machine.waitFor((report) => report.run?.state === 'cancelled', 'the cancel');
      expect(cancelled.state.status).toBe('ready');
    },
  );

  it('should halt into alarm on stop and recover by unlocking then homing', { timeout: 60_000 }, async () => {
    const machine = await connect();
    await machine.waitFor(ready, 'the boot homing');
    await machine.runJob(plain);
    await machine.waitFor((report) => report.run?.state === 'running', 'the run');

    const stop: MachineCommandReceipt = await machine.session.stop({
      operationId: 'stop-1',
      signal: new AbortController().signal,
    });
    expect(stop.status).toBe('accepted');
    const halted = await machine.waitFor((report) => report.state.status === 'alarm', 'the halt');
    expect(halted.run?.state).toBe('cancelled');
    expect(halted.alerts).toContainEqual({
      code: 'H1',
      severity: 'serious',
      message: 'Halted',
      blocks: 'motion',
      remedies: [
        { type: 'action', componentId: 'controller', action: 'controller.unlock' },
        { type: 'action', componentId: 'motion', action: 'motion.home' },
      ],
    });
    expect(componentValue(halted.components, 'motion', 'motion')?.trust).toBe('lost');
    expect(componentValue(halted.components, 'spindle', 'spindle')?.mode).toBe('off');

    const unlock = await machine.act('controller', 'controller.unlock');
    expect(await unlock.settled()).toEqual({ status: 'confirmed' });
    const unlocked = await machine.waitFor((report) => report.state.status === 'ready', 'the unlock');
    expect(componentValue(unlocked.components, 'motion', 'motion')?.trust).toBe('lost');
    const home = await machine.act('motion', 'motion.home');
    expect(await home.settled()).toEqual({ status: 'confirmed' });
    await machine.waitFor(ready, 'homing');
  });

  it(
    'should refuse an interlocked action with the cover open and keep running a job with it open',
    { timeout: 60_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');
      machine.simulator.setCover(false);
      await machine.waitFor(
        (report) => componentValue(report.components, 'cover', 'interlock')?.state === 'unsafe',
        'the cover',
      );
      const home = await machine.act('motion', 'motion.home');
      expect(home.receipt).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_INTERLOCK' });
      const prepared = await machine.jobs.prepare(machine.job('prepare-1', options));
      expect(prepared.status).toBe('blocked');
      machine.simulator.setCover(true);
      await machine.waitFor(
        (report) => componentValue(report.components, 'cover', 'interlock')?.state === 'safe',
        'the cover',
      );
      await machine.runJob(plain);
      await machine.waitFor((report) => report.run?.state === 'running', 'the run');
      machine.simulator.setCover(false);
      const open = await machine.waitFor(
        (report) => report.alerts.some((alert) => alert.code === 'cover-open'),
        'the cover alert',
      );
      expect(open.run?.state).toBe('running');
    },
  );

  it('should report a run read to its end without a halt as completed', { timeout: 60_000 }, async () => {
    const machine = await connect();
    await machine.waitFor(ready, 'the boot homing');
    await machine.runJob(plain);
    await machine.waitFor((report) => report.run?.state === 'running', 'the run');
    const ended = await machine.waitFor((report) => report.run?.endedAt !== undefined, 'the end of the run', 30_000);
    expect(ended.run).toMatchObject({ runId: 'tau-start-1', state: 'completed' });
    expect(
      await machine.session.reconcile({ operationId: 'start-1', kind: 'start', signal: new AbortController().signal }),
    ).toMatchObject({
      status: 'accepted',
      runId: 'tau-start-1',
    });
  });

  it('should jog while held and stop sending once released', { timeout: 60_000 }, async () => {
    const machine = await connect();
    const start = await machine.waitFor(ready, 'the boot homing');
    if (machine.session.holds.type !== 'supported') {
      throw new Error('The simulator holds a jog.');
    }
    const hold = await machine.session.holds.begin({
      operationId: 'hold-1',
      componentId: 'motion',
      hold: 'motion.jog',
      parameters: { axis: 'x', direction: -1, feed: 3000 },
      requestedBy: { kind: 'user' },
      signal: new AbortController().signal,
    });
    if ('code' in hold) {
      throw new Error(hold.message);
    }
    for (let renewal = 0; renewal < 15; renewal += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a person renews a hold one lease at a time.
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- each renewal waits for the last.
      await hold.extend();
    }
    expect(await hold.release()).toMatchObject({ status: 'accepted' });
    const stopped = await machine.waitFor((report) => report.state.status === 'ready', 'the jog to end');
    const before = componentValue(start.components, 'motion', 'motion')!.position.machine['x']!;
    const after = componentValue(stopped.components, 'motion', 'motion')!.position.machine['x']!;
    expect(after).toBeLessThan(before);
    // Never more than one segment and a half queued: 7.5 mm at 3000 mm/min.
    const jogs = machine.simulator.commands().filter((command) => command.startsWith('$J'));
    expect(jogs.length).toBeGreaterThan(1);
    expect(jogs.every((command) => command === '$J X-7.500 F3000')).toBe(true);
  });

  it('should report occupied while another app holds the machine', { timeout: 30_000 }, async () => {
    const first = await connect();
    await first.waitFor(ready, 'the boot homing');
    const second = await connect(first.simulator);
    const report = await second.session.getSnapshot({ signal: new AbortController().signal });
    expect(report.connection).toBe('occupied');
    expect(report.alerts.map(({ code, blocks }) => [code, blocks])).toEqual([['occupied', 'everything']]);
  });
  it(
    'should reject a play the machine refuses and leave the next run started at its screen external',
    { timeout: 60_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');
      const prepared = await machine.prepareStored('prepare-1', plain);
      const stored = { remoteName: prepared.remoteName, providerData: prepared.providerData };

      // The file is not on the machine yet: it answers only in text.
      const start = await machine.jobs.start({ ...machine.job('start-1', plain), ...stored });
      expect(start).toMatchObject({ status: 'rejected', code: 'MACHINE_JOB_START_REFUSED' });

      await machine.jobs.transfer({ ...machine.job('transfer-1', plain), ...stored });
      machine.simulator.play(prepared.remoteName);
      const external = await machine.waitFor((report) => report.run?.state === 'running', 'the run from the screen');
      expect(external.run?.origin).toBe('external');
      expect(external.run?.runId).not.toBe('tau-start-1');
    },
  );

  it(
    'should pin the file name, refuse a damaged or refused upload and a transfer while running',
    { timeout: 60_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');
      const prepared = await machine.prepareStored('prepare-1', plain);
      const transfer = async (operationId: string, remoteName = prepared.remoteName) =>
        machine.jobs.transfer({
          ...machine.job(operationId, plain),
          remoteName,
          providerData: prepared.providerData,
        });

      expect(await transfer('transfer-1', '/sd/gcodes/other.nc')).toMatchObject({
        status: 'rejected',
        code: 'MACHINE_TRANSFER_NAME_MISMATCH',
      });
      expect(machine.simulator.files()).toEqual([]);

      machine.simulator.damageNextUpload();
      expect(await transfer('transfer-2')).toMatchObject({ status: 'rejected', code: 'MACHINE_TRANSFER_CORRUPT' });
      expect(await transfer('transfer-3')).toMatchObject({ status: 'accepted' });

      // Started at the screen after Tau's last report: the machine refuses the upload itself.
      machine.simulator.play(prepared.remoteName);
      expect(await transfer('transfer-4')).toMatchObject({ status: 'rejected', code: 'MACHINE_TRANSFER_REFUSED' });
      await machine.waitFor((report) => report.run !== undefined, 'the run');
      expect(await transfer('transfer-5')).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_BUSY' });
    },
  );

  it('should fail a tool change that Stop interrupts and lose the position', { timeout: 60_000 }, async () => {
    const machine = await connect();
    await machine.waitFor(ready, 'the boot homing');
    const change = await machine.act('tools', 'tool.change', { tool: 3 });
    expect(change.receipt.status).toBe('accepted');
    await machine.waitFor((report) => report.state.status === 'active', 'the change to start');
    const stop = await machine.session.stop({ operationId: 'stop-1', signal: new AbortController().signal });
    expect(stop.status).toBe('accepted');
    const halted = await machine.waitFor((report) => report.state.status === 'alarm', 'the halt');
    expect(halted.activities.find((activity) => activity.kind === 'tool-change')).toMatchObject({
      state: 'failed',
      message: 'Stopped from Tau.',
    });
    expect(halted.alerts.map(({ code }) => code)).toContain('H1');
    expect(componentValue(halted.components, 'motion', 'motion')?.trust).toBe('lost');
    expect(await change.settled()).toMatchObject({ status: 'refuted' });
  });

  it('should halt on the emergency stop and refuse a start while it is pressed', { timeout: 60_000 }, async () => {
    const machine = await connect();
    await machine.waitFor(ready, 'the boot homing');
    const prepared = await machine.prepareStored('prepare-1', plain);
    machine.simulator.setEstop(true);
    const halted = await machine.waitFor(
      (report) =>
        report.state.status === 'alarm' && componentValue(report.components, 'estop', 'interlock')?.state === 'unsafe',
      'the emergency stop',
    );
    expect(halted.alerts).toContainEqual(expect.objectContaining({ code: 'H13', blocks: 'motion' }));
    const unlock = await machine.act('controller', 'controller.unlock');
    expect(await unlock.settled()).toEqual({ status: 'confirmed' });
    // Unlocked, the button is still pressed: only `diagnose` says so now.
    await machine.waitFor(
      (report) =>
        report.state.status === 'ready' && componentValue(report.components, 'estop', 'interlock')?.state === 'unsafe',
      'the unlock with the button still pressed',
    );
    const start = await machine.jobs.start({
      ...machine.job('start-1', plain),
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    expect(start).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_INTERLOCK' });
  });

  it('should keep a stored run as Tau’s across a dropped link', { timeout: 60_000 }, async () => {
    const machine = await connect(createCarveraSimulator({ speed: 25, tickInterval: 10, runDuration: 600_000 }));
    await machine.waitFor(ready, 'the boot homing');
    await machine.runJob(plain);
    await machine.waitFor((report) => report.run?.state === 'running', 'the run');
    machine.simulator.drop();
    const lost = await machine.waitFor((report) => report.connection === 'disconnected', 'the drop');
    expect(lost.run).toMatchObject({ runId: 'tau-start-1', origin: 'tau' });
    const back = await machine.waitFor(
      (report) => report.connection === 'connected' && report.run?.state === 'running',
      'the reconnect',
    );
    expect(back.run).toMatchObject({ runId: 'tau-start-1', origin: 'tau' });
  });

  it(
    'should complete the start form from the machine, set a work origin by Z alone and move the prepared setup',
    { timeout: 60_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');
      if (machine.session.jobs.type !== 'supported' || machine.session.jobs.completeConfiguration === undefined) {
        throw new Error('The simulator completes the start form.');
      }
      const { completeConfiguration } = machine.session.jobs;
      const complete = async (configuration: Readonly<Record<string, string | boolean>>) =>
        completeConfiguration({
          expectedMachineId: 'carvera-simulator',
          artifact,
          configuration,
          signal: new AbortController().signal,
        });
      expect(await complete({})).toEqual({ workOffset: 'G54' });
      const select = await machine.act('motion', 'work-offset.select', { offset: 'G55' });
      expect(await select.settled()).toEqual({ status: 'confirmed' });
      expect(await complete({})).toEqual({ workOffset: 'G55' });
      expect(await complete({ workOffset: 'G56', probeZ: false })).toEqual({ workOffset: 'G56', probeZ: false });
      const back = await machine.act('motion', 'work-offset.select', { offset: 'G54' });
      expect(await back.settled()).toEqual({ status: 'confirmed' });

      const invalid = await machine.act('motion', 'motion.jog', { axis: 'x', distance: 'far', feed: 100 });
      expect(invalid.receipt).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_PARAMETERS_INVALID' });

      const before = await machine.prepareStored('prepare-1', plain);
      const set = await machine.act('motion', 'work-offset.set', { offset: 'G54', position: { z: 0 } });
      expect(set.receipt.status).toBe('accepted');
      expect(await set.settled()).toEqual({ status: 'confirmed' });
      await vi.waitFor(
        async () => {
          const after = await machine.prepareStored('prepare-2', plain);
          expect(after.setup).not.toEqual(before.setup);
        },
        { timeout: 10_000, interval: 50 },
      );
    },
  );

  it(
    'should answer a tool wait, refuse a stale answer, and refuse to resume with the spindle stopped',
    { timeout: 60_000 },
    async () => {
      const waits = ['G90 G21 G54', 'G0 X0 Y0 Z5', 'M490.1', 'G0 X10', 'M5', 'M600', 'G0 X20', 'M30'].join('\n');
      const machine = await connect(createCarveraSimulator({ speed: 25, tickInterval: 10 }), waits);
      await machine.waitFor(ready, 'the boot homing');
      await machine.runJob(plain);
      const waiting = await machine.waitFor(
        (report) => report.activities.some((activity) => activity.awaiting !== undefined),
        'the tool wait',
      );
      expect(waiting.state).toMatchObject({ status: 'held', native: 'Tool' });
      const prompt = waiting.activities.find((activity) => activity.awaiting !== undefined);
      if (prompt?.awaiting?.kind !== 'confirmation') {
        throw new Error('The tool wait asks for a confirmation.');
      }
      const stale = await machine.act('controller', 'interaction.respond', {
        activityId: prompt.activityId,
        promptId: 'tool-wait-0',
        answer: 'fitted',
      });
      expect(stale.receipt).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_PROMPT_STALE' });
      const answer = await machine.act('controller', 'interaction.respond', {
        activityId: prompt.activityId,
        promptId: prompt.awaiting.promptId,
        answer: 'fitted',
      });
      expect(await answer.settled()).toEqual({ status: 'confirmed' });

      const paused = await machine.waitFor((report) => report.run?.state === 'paused', 'the program’s pause');
      expect(paused.run?.paused).toEqual({ by: 'program', reason: 'Paused by the program or at the machine' });
      const resume = await machine.act('controller', 'run.resume');
      expect(resume.receipt).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_PRECONDITION_FAILED' });
    },
  );

  it('should keep a start the machine showed late as Tau’s run', { timeout: 30_000 }, async () => {
    // Four real seconds of a busy machine before `P:`: longer than the session waits for the run to show.
    const machine = await connect(createCarveraSimulator({ speed: 25, tickInterval: 10, playDelay: 100_000 }));
    await machine.waitFor(ready, 'the boot homing');
    const { start } = await machine.runJob(plain);
    expect(start).toMatchObject({ status: 'unknown', runId: expect.any(String) as unknown });
    const running = await machine.waitFor((report) => report.run !== undefined, 'the late run', 10_000);
    expect(running.run).toMatchObject({ origin: 'tau', runId: start.status === 'unknown' ? start.runId : '' });
  });

  it(
    'should queue a timed spindle run whole and refuse to switch it off early, naming Stop',
    { timeout: 30_000 },
    async () => {
      const machine = await connect();
      await machine.waitFor(ready, 'the boot homing');
      const spin = await machine.act('spindle', 'spindle.set', { mode: 'clockwise', speed: 10_000, duration: 300 });
      expect(await spin.settled()).toEqual({ status: 'confirmed' });
      // The stop goes to the machine with the dwell, so the run ends there even if Tau never sends another byte.
      const sent = machine.simulator.commands();
      const at = sent.indexOf('M3 S10000');
      expect(sent.slice(at, at + 3)).toEqual(['M3 S10000', 'G4 P300.0', 'M5']);
      const turning = await machine.waitFor((report) => report.state.status === 'active', 'the timed run');
      const stopRemedy = {
        type: 'person',
        instruction:
          'To end it now, press Stop: the Carvera halts and loses its position, so unlock and home it after.',
      };
      expect(turning.availability.find(({ id }) => id === 'spindle.set')).toMatchObject({
        state: 'unavailable',
        code: 'MACHINE_ACTION_BUSY',
        remedy: stopRemedy,
      });
      await expect(machine.act('spindle', 'spindle.set', { mode: 'off' })).resolves.toMatchObject({
        receipt: {
          status: 'rejected',
          code: 'MACHINE_ACTION_BUSY',
          message: 'The spindle is on a timed run and stops by itself when the time is up.',
        },
      });
      expect(machine.simulator.commands().filter((line) => line === 'M5')).toHaveLength(1);
    },
  );

  it(
    'should confirm the spindle, the switches and the overrides from the machine’s reports',
    { timeout: 60_000 },
    async () => {
      const machine = await connect(createCarveraSimulator({ speed: 25, tickInterval: 10, runDuration: 600_000 }));
      await machine.waitFor(ready, 'the boot homing');
      const spin = await machine.act('spindle', 'spindle.set', { mode: 'clockwise', speed: 10_000, duration: 10 });
      expect(await spin.settled()).toEqual({ status: 'confirmed' });
      // The stop is queued behind the dwell: the spindle stops by itself.
      await machine.waitFor(
        (report) =>
          report.state.status === 'ready' && componentValue(report.components, 'spindle', 'spindle')?.mode === 'off',
        'the spindle to stop by itself',
      );
      const off = await machine.act('spindle', 'spindle.set', { mode: 'off' });
      expect(await off.settled()).toEqual({ status: 'confirmed' });
      for (const [componentId, on] of [
        ['light', false],
        ['vacuum', true],
        ['air', true],
      ] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one switch at a time, each read back from diagnose.
        const switched = await machine.act(componentId, 'switch.set', { on });
        // oxlint-disable-next-line eslint/no-await-in-loop -- each confirmation waits for the next diagnose.
        expect(await switched.settled()).toEqual({ status: 'confirmed' });
      }
      // The last switch line sits in the planner for a moment, and the machine takes an upload only with it empty.
      await vi.waitFor(() => {
        expect(machine.simulator.queued()).toBe(0);
      });
      await machine.runJob(plain);
      await machine.waitFor((report) => report.run?.state === 'running', 'the run');
      const feed = await machine.act('feed-override', 'level.set', { ratio: 1.5 });
      expect(await feed.settled()).toEqual({ status: 'confirmed' });
      const speed = await machine.act('spindle-override', 'level.set', { ratio: 0.8 });
      expect(await speed.settled()).toEqual({ status: 'confirmed' });
    },
  );

  it('should observe a snapshot first, return on abort and leave no listener behind', { timeout: 30_000 }, async () => {
    const machine = await connect();
    await machine.waitFor((report) => report.connection === 'connected', 'the connection');
    const abort = new AbortController();
    const reports = machine.session.observe({ signal: abort.signal })[Symbol.asyncIterator]();
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each observation follows the last.
      const next = await reports.next();
      expect(next.done === false && next.value.type).toBe('snapshot');
    }
    expect(getEventListeners(abort.signal, 'abort').length).toBeLessThanOrEqual(1);
    abort.abort();
    const last = await reports.next();
    expect(last.done).toBe(true);

    // Never sent by this session: pending for a person to reconcile, and no record to reconcile with.
    expect(
      machine.actions.confirm({
        operationId: 'never-sent',
        componentId: 'light',
        action: 'switch.set',
        version: 1,
        expectedRunId: null,
        parameters: { on: true },
      }),
    ).toEqual({ status: 'pending' });
    expect(
      await machine.session.reconcile({ operationId: 'never-sent', kind: 'action', signal: abort.signal }),
    ).toMatchObject({ status: 'unknown' });
  });

  it('should block everything on a Carvera Air', { timeout: 30_000 }, async () => {
    const machine = await connect(createCarveraSimulator({ speed: 25, tickInterval: 10, model: 2 }));
    const report = await machine.waitFor((next) => next.connection === 'connected', 'the connection');
    expect(report.alerts).toContainEqual(expect.objectContaining({ code: 'model', blocks: 'everything' }));
    const descriptor = await machine.session.getDescriptor({ signal: new AbortController().signal });
    expect(descriptor.model).toBe('Carvera Air');
  });
  it('should report a pause an agent asked for as the agent’s', { timeout: 60_000 }, async () => {
    const machine = await connect();
    await machine.waitFor(ready, 'the boot homing');
    await machine.runJob(plain);
    await machine.waitFor((report) => report.run?.state === 'running', 'the run');
    const pause = await machine.act('controller', 'run.pause', {}, 'agent');
    expect(await pause.settled()).toEqual({ status: 'confirmed' });
    const paused = await machine.waitFor((report) => report.run?.state === 'paused', 'the pause');
    expect(paused.run?.paused).toEqual({ by: 'agent', reason: 'Paused from Tau' });
  });

  it('should wake a Carvera found asleep before its position is known', { timeout: 60_000 }, async () => {
    const simulator = createCarveraSimulator({ speed: 25, tickInterval: 10 });
    const first = await connect(simulator);
    await first.waitFor(ready, 'the boot homing');
    await first.session.close();
    simulator.sleep();
    const machine = await connect(simulator);
    const asleep = await machine.waitFor((report) => report.state.status === 'asleep', 'sleep');
    expect(componentValue(asleep.components, 'motion', 'motion')?.trust).toBe('unknown');
    const wake = await machine.act('controller', 'controller.wake');
    expect(wake.receipt.status).toBe('accepted');
    expect(await wake.settled()).toEqual({ status: 'confirmed' });
    await machine.waitFor(ready, 'homing after the restart');
  });
});
