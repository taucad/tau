// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { ShellLaunch } from '#shell/shell-provider.js';
import {
  WindowsSandboxProtocolError,
  createWindowsFrameDecoder,
  decodeWindowsHelperFrame,
  encodeWindowsFrame,
  encodeWindowsHostFrame,
  isShellRequirement,
  windowsFramePayloadLimit,
  windowsExclusiveLaunchRequirement,
  windowsHelperEnd,
  windowsLaunchSpec,
} from '#shell/windows-sandbox-protocol.js';

const encoder = new TextEncoder();
const text = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes);
const raw = (type: number, value: unknown): { type: number; payload: Uint8Array<ArrayBuffer> } => ({
  type,
  payload: encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)),
});

describe('windows sandbox frames', () => {
  it('should write the type byte, a little-endian length and the payload', () => {
    const frame = encodeWindowsFrame(0x82, encoder.encode('abc'));

    expect([...frame]).toStrictEqual([0x82, 3, 0, 0, 0, 97, 98, 99]);
  });

  it('should encode each host frame with its contract type', () => {
    expect([...encodeWindowsHostFrame({ type: 'start' })]).toStrictEqual([0x02, 0, 0, 0, 0]);
    expect([...encodeWindowsHostFrame({ type: 'terminate' })]).toStrictEqual([0x05, 0, 0, 0, 0]);
    expect([...encodeWindowsHostFrame({ type: 'close-input' })]).toStrictEqual([0x06, 0, 0, 0, 0]);
    expect([
      ...encodeWindowsHostFrame({
        type: 'input',
        bytes: new Uint8Array([7, 8]),
      }),
    ]).toStrictEqual([0x03, 2, 0, 0, 0, 7, 8]);
    const resize = encodeWindowsHostFrame({
      type: 'resize',
      size: { columns: 120, rows: 40 },
    });
    expect(resize[0]).toBe(0x04);
    expect(JSON.parse(text(resize.subarray(5)))).toStrictEqual({
      columns: 120,
      rows: 40,
    });
  });

  it('should carry a native worker spec with its digest, stdin and network on the wire as written', () => {
    const spec = {
      version: 1,
      executable: String.raw`C:\Users\person\AppData\Local\Tau\python\pythonw.exe`,
      executableDigest: `sha256:${'ab'.repeat(32)}`,
      arguments: ['-I', '-m', 'tau_worker'],
      workingDirectory: String.raw`C:\Projects\gear\.tau\out`,
      environment: {},
      stdio: { kind: 'pipes', input: true },
      filesystem: {
        readable: [String.raw`C:\Users\person\AppData\Local\Tau\python`],
        writable: [String.raw`C:\Projects\gear\.tau\out`],
        readOnly: [],
        denied: [],
      },
      network: { domains: [] },
      journal: String.raw`C:\custody\worker.acl.json`,
    } as const;
    const frame = encodeWindowsHostFrame({ type: 'spec', spec });

    expect(frame[0]).toBe(0x01);
    expect(JSON.parse(text(frame.subarray(5)))).toStrictEqual(spec);
    expect(
      JSON.parse(text(encodeWindowsHostFrame({ type: 'spec', spec: { ...spec, network: undefined } }).subarray(5))),
    ).not.toHaveProperty('network');
  });

  it('should refuse a frame type that is not one byte', () => {
    expect(() => encodeWindowsFrame(0x1_00)).toThrow(WindowsSandboxProtocolError);
  });
});

describe('windows sandbox frame decoder', () => {
  it('should reassemble frames split across chunks and split chunks holding several frames', () => {
    const decoder = createWindowsFrameDecoder();
    const bytes = new Uint8Array([
      ...encodeWindowsFrame(0x82, encoder.encode('hello')),
      ...encodeWindowsFrame(0x83, encoder.encode('')),
      ...encodeWindowsFrame(0x84, encoder.encode('xy')),
    ]);

    const first = decoder.push(bytes.subarray(0, 3));
    const second = decoder.push(bytes.subarray(3, 15));
    const third = decoder.push(bytes.subarray(15));

    expect(first).toStrictEqual([]);
    expect(second.map((frame) => [frame.type, text(frame.payload)])).toStrictEqual([
      [0x82, 'hello'],
      [0x83, ''],
    ]);
    expect(third.map((frame) => [frame.type, text(frame.payload)])).toStrictEqual([[0x84, 'xy']]);
    expect(decoder.pending()).toBe(0);
  });

  it('should report the bytes of a cut frame as pending', () => {
    const decoder = createWindowsFrameDecoder();

    decoder.push(encodeWindowsFrame(0x82, encoder.encode('hello')).subarray(0, 7));

    expect(decoder.pending()).toBe(7);
  });

  it('should reject a frame longer than the payload limit and stay failed', () => {
    const decoder = createWindowsFrameDecoder();
    const header = new Uint8Array(5);
    new DataView(header.buffer).setUint8(0, 0x82);
    new DataView(header.buffer).setUint32(1, windowsFramePayloadLimit + 1, true);

    expect(() => decoder.push(header)).toThrow('exceeds the frame limit');
    expect(() => decoder.push(new Uint8Array(0))).toThrow(WindowsSandboxProtocolError);
  });
});

describe('windows helper frames', () => {
  it('should read ready, started, exit and cleanup-failed payloads', () => {
    expect(
      decodeWindowsHelperFrame(
        raw(0x81, {
          launcherPid: 10,
          runnerPid: 11,
          capabilitySid: 'S-1-5-21-1-2-3',
          journal: String.raw`C:\j.acl.json`,
        }),
      ),
    ).toStrictEqual({
      type: 'ready',
      ready: {
        launcherPid: 10,
        runnerPid: 11,
        capabilitySid: 'S-1-5-21-1-2-3',
        journal: String.raw`C:\j.acl.json`,
      },
    });
    expect(decodeWindowsHelperFrame(raw(0x87, { shellPid: 12 }))).toStrictEqual({ type: 'started', shellPid: 12 });
    expect(decodeWindowsHelperFrame(raw(0x85, { exitCode: 2 }))).toStrictEqual({
      type: 'exit',
      exit: { exitCode: 2 },
    });
    expect(decodeWindowsHelperFrame(raw(0x85, { signal: 'SIGKILL' }))).toStrictEqual({
      type: 'exit',
      exit: { signal: 'SIGKILL' },
    });
    expect(decodeWindowsHelperFrame(raw(0x88, { message: 'job not empty' }))).toStrictEqual({
      type: 'cleanup-failed',
      message: 'job not empty',
    });
  });

  it('should read a refusal with its optional requirement and diagnostic', () => {
    expect(
      decodeWindowsHelperFrame(
        raw(0x86, {
          status: 'unsupported',
          requirement: 'filesystem-mask',
          message: 'no',
          diagnostic: 'd',
        }),
      ),
    ).toStrictEqual({
      type: 'refused',
      refusal: {
        status: 'unsupported',
        requirement: 'filesystem-mask',
        message: 'no',
        diagnostic: 'd',
      },
    });
    expect(decodeWindowsHelperFrame(raw(0x86, { status: 'sandbox-unavailable', message: 'missing' }))).toStrictEqual({
      type: 'refused',
      refusal: { status: 'sandbox-unavailable', message: 'missing' },
    });
    expect(
      decodeWindowsHelperFrame(
        raw(0x86, { status: 'sandbox-unavailable', requirement: windowsExclusiveLaunchRequirement, message: 'busy' }),
      ),
    ).toStrictEqual({
      type: 'refused',
      refusal: { status: 'sandbox-unavailable', requirement: 'exclusive-launch', message: 'busy' },
    });
  });

  it('should pass output bytes through untouched', () => {
    const frame = decodeWindowsHelperFrame({
      type: 0x84,
      payload: new Uint8Array([0, 255, 27]),
    });

    expect(frame.type).toBe('output');
    expect(frame.type === 'output' ? [...frame.bytes] : []).toStrictEqual([0, 255, 27]);
  });

  it.each([
    ['an unknown type', raw(0x7f, ''), 'unknown frame type 0x7f'],
    ['a non-JSON ready', raw(0x81, '{'), 'ready frame is not UTF-8 JSON'],
    ['an exit naming both endings', raw(0x85, { exitCode: 0, signal: 'SIGKILL' }), 'exit frame is malformed'],
    ['an exit naming neither ending', raw(0x85, {}), 'exit frame is malformed'],
    ['a ready without a capability SID', raw(0x81, { launcherPid: 1, runnerPid: 1, journal: 'j' }), 'malformed'],
    ['a refusal with an unknown status', raw(0x86, { status: 'maybe', message: 'm' }), 'refused frame is malformed'],
  ])('should reject %s', (_name, frame, message) => {
    expect(() => decodeWindowsHelperFrame(frame)).toThrow(message);
    expect(() => decodeWindowsHelperFrame(frame)).toThrow(WindowsSandboxProtocolError);
  });

  it('should recognise only the seam requirements', () => {
    expect(isShellRequirement('network-isolation')).toBe(true);
    expect(isShellRequirement('quantum')).toBe(false);
    expect(isShellRequirement(undefined)).toBe(false);
  });
});

describe('windowsLaunchSpec', () => {
  const launch: Pick<
    ShellLaunch,
    'executablePath' | 'arguments' | 'workingDirectory' | 'environment' | 'stdio' | 'filesystem'
  > = {
    executablePath: String.raw`C:\Program Files\PowerShell\7\pwsh.exe`,
    arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Get-Date'],
    workingDirectory: String.raw`C:\Projects\gear`,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment names keep their wire spelling.
    environment: { PATH: String.raw`C:\Windows\System32` },
    stdio: { kind: 'pipes' },
    filesystem: {
      readable: [String.raw`C:\Toolchain`],
      writable: [String.raw`C:\Projects\gear`, String.raw`C:\Temp\tau-shell-1\home`],
      denied: [String.raw`C:\Users\person\.ssh`],
    },
  };

  it('should carry the launch verbatim with the journal and the baseline denied set merged once', () => {
    const spec = windowsLaunchSpec(launch, {
      journal: String.raw`C:\custody\id.acl.json`,
      baselineDenied: [String.raw`C:\Users\person\.ssh`, String.raw`C:\Users\person\.aws`],
    });

    expect(spec).toStrictEqual({
      version: 1,
      executable: String.raw`C:\Program Files\PowerShell\7\pwsh.exe`,
      arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Get-Date'],
      workingDirectory: String.raw`C:\Projects\gear`,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment names keep their wire spelling.
      environment: { PATH: String.raw`C:\Windows\System32` },
      stdio: { kind: 'pipes' },
      filesystem: {
        readable: [String.raw`C:\Toolchain`],
        writable: [String.raw`C:\Projects\gear`, String.raw`C:\Temp\tau-shell-1\home`],
        readOnly: [],
        denied: [String.raw`C:\Users\person\.ssh`, String.raw`C:\Users\person\.aws`],
      },
      journal: String.raw`C:\custody\id.acl.json`,
    });
  });

  it('should spell a terminal launch with its columns and rows', () => {
    const spec = windowsLaunchSpec(
      {
        ...launch,
        stdio: { kind: 'terminal', size: { columns: 100, rows: 30 } },
      },
      { journal: String.raw`C:\j.acl.json` },
    );

    expect(spec.stdio).toStrictEqual({
      kind: 'terminal',
      columns: 100,
      rows: 30,
    });
  });
});

describe('windowsHelperEnd', () => {
  it('should name an NTSTATUS a helper dies with before it can report, and leave other exits as they are', () => {
    expect(windowsHelperEnd(3_221_225_794, undefined)).toMatch(
      /^exit 3221225794, 0xC0000142 STATUS_DLL_INIT_FAILED: Windows could not start it/u,
    );
    expect(windowsHelperEnd(-1_073_741_502, undefined)).toMatch(
      /^exit -1073741502, 0xC0000142 STATUS_DLL_INIT_FAILED/u,
    );
    expect(windowsHelperEnd(9, undefined)).toBe('exit 9');
    expect(windowsHelperEnd(undefined, 'SIGKILL')).toBe('signal SIGKILL');
  });
});
