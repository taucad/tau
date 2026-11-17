/**
 * The framed launch protocol between the win32 shell provider and `tau-windows-sandbox.exe launch`
 * (`windows-sandbox/README.md`, "Launch protocol").
 *
 * Every frame is `type: u8`, `length: u32` little-endian, then `length` payload bytes. JSON payloads are UTF-8. The
 * host writes host frames to the helper's stdin and reads helper frames from its stdout. Nothing here starts a process.
 */
import { z } from 'zod';

import type { ShellExit, ShellLaunch, ShellRequirement, ShellTerminalSize } from '#shell/shell-provider.js';

/** The launch spec version this host speaks. @public */
export const windowsSandboxProtocolVersion = 1;

/** Host-to-helper frame types. @public */
export const windowsHostFrameType = {
  spec: 0x01,
  start: 0x02,
  input: 0x03,
  resize: 0x04,
  terminate: 0x05,
  closeInput: 0x06,
} as const;

/** Helper-to-host frame types. @public */
export const windowsHelperFrameType = {
  ready: 0x81,
  stdout: 0x82,
  stderr: 0x83,
  output: 0x84,
  exit: 0x85,
  refused: 0x86,
  started: 0x87,
  cleanupFailed: 0x88,
} as const;

/** The type byte and the four length bytes. */
const headerBytes = 5;

/**
 * The largest payload either side accepts. A spec carries every path a launch names and output frames are relayed in
 * pipe-sized pieces, so a larger frame is a broken or hostile peer, never a real launch.
 *
 * @public
 */
export const windowsFramePayloadLimit = 16 * 1024 * 1024;

/**
 * A violation of the launch protocol: an unknown frame, an oversized or malformed payload, or a frame out of order.
 *
 * @public
 */
export class WindowsSandboxProtocolError extends Error {
  public override readonly name = 'WindowsSandboxProtocolError';
}

/**
 * The JSON launch spec (`0x01`): everything the helper enforces for one launch. Every path is absolute and already
 * resolved by the host; `writable` includes the private HOME and temporary roots.
 *
 * @public
 */
export type WindowsLaunchSpec = Readonly<{
  version: typeof windowsSandboxProtocolVersion;
  executable: string;
  /**
   * `sha256:<64 lowercase hex>` of the executable. Required for an executable outside `%ProgramFiles%` and
   * `%SystemRoot%` (a native worker's), whose folder must then be readable and never writable; checked when given for
   * one inside them.
   */
  executableDigest?: string | undefined;
  arguments: readonly string[];
  workingDirectory: string;
  environment: Readonly<Record<string, string>>;
  /** `input: true` gives a pipes launch a stdin the host writes with `input` frames and ends with `close-input`. */
  stdio:
    | Readonly<{ kind: 'pipes'; input?: boolean | undefined }>
    | Readonly<{ kind: 'terminal'; columns: number; rows: number }>;
  filesystem: Readonly<{
    readable: readonly string[];
    writable: readonly string[];
    readOnly: readonly string[];
    denied: readonly string[];
  }>;
  /**
   * The launch's network. Omitted or `{ domains: [] }` (the helper also reads `null` so): none at all (the AppContainer has no network
   * capability). Named domains are refused with `network-isolation` until the helper has the sandbox proxy.
   */
  network?: Readonly<{ domains: readonly string[] }> | undefined;
  /** Where the helper journals each descriptor it changes before it changes it. */
  journal: string;
}>;

/** One host-to-helper frame. @public */
export type WindowsHostFrame =
  | Readonly<{ type: 'spec'; spec: WindowsLaunchSpec }>
  | Readonly<{ type: 'start' }>
  | Readonly<{ type: 'input'; bytes: Uint8Array<ArrayBuffer> }>
  | Readonly<{ type: 'resize'; size: ShellTerminalSize }>
  | Readonly<{ type: 'terminate' }>
  | Readonly<{ type: 'close-input' }>;

/** The helper's `ready` payload (`0x81`). @public */
export type WindowsHelperReady = Readonly<{
  launcherPid: number;
  runnerPid: number;
  capabilitySid: string;
  journal: string;
}>;

/**
 * The `requirement` of a `sandbox-unavailable` refusal sent while another launch holds the sandbox: nothing changed,
 * and the same launch may be retried once that one has ended. Match it, never the message. @public
 */
export const windowsExclusiveLaunchRequirement = 'exclusive-launch';

/** The helper's `refused` payload (`0x86`); nothing ran. @public */
export type WindowsHelperRefusal = Readonly<{
  status: 'sandbox-unavailable' | 'unsupported';
  /** For `unsupported`, what cannot be enforced; for `sandbox-unavailable`, {@link windowsExclusiveLaunchRequirement} or absent. */
  requirement?: string | undefined;
  message: string;
  diagnostic?: string | undefined;
}>;

/** One helper-to-host frame. @public */
export type WindowsHelperFrame =
  | Readonly<{ type: 'ready'; ready: WindowsHelperReady }>
  | Readonly<{
      type: 'stdout' | 'stderr' | 'output';
      bytes: Uint8Array<ArrayBuffer>;
    }>
  | Readonly<{ type: 'exit'; exit: ShellExit }>
  | Readonly<{ type: 'refused'; refusal: WindowsHelperRefusal }>
  | Readonly<{ type: 'started'; shellPid: number }>
  | Readonly<{ type: 'cleanup-failed'; message: string }>;

/** One frame as read off the wire, before its payload is interpreted. @public */
export type WindowsRawFrame = Readonly<{
  type: number;
  payload: Uint8Array<ArrayBuffer>;
}>;

const encoder = new TextEncoder();

/**
 * Encode one frame.
 *
 * @public
 * @param type - The frame type byte.
 * @param payload - The payload bytes.
 * @returns The frame, header first.
 */
export const encodeWindowsFrame = (
  type: number,
  payload: Uint8Array<ArrayBuffer> = new Uint8Array(0),
): Uint8Array<ArrayBuffer> => {
  if (!Number.isInteger(type) || type < 0 || type > 0xff) {
    throw new WindowsSandboxProtocolError(`Frame type ${String(type)} is not one byte.`);
  }
  if (payload.byteLength > windowsFramePayloadLimit) {
    throw new WindowsSandboxProtocolError(`A ${String(payload.byteLength)}-byte payload exceeds the frame limit.`);
  }
  const frame = new Uint8Array(headerBytes + payload.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint8(0, type);
  view.setUint32(1, payload.byteLength, true);
  frame.set(payload, headerBytes);
  return frame;
};

const json = (value: unknown): Uint8Array<ArrayBuffer> => encoder.encode(JSON.stringify(value));

/**
 * Encode one host-to-helper frame.
 *
 * @public
 * @param frame - The frame.
 * @returns Its bytes.
 */
export const encodeWindowsHostFrame = (frame: WindowsHostFrame): Uint8Array<ArrayBuffer> => {
  switch (frame.type) {
    case 'spec': {
      return encodeWindowsFrame(windowsHostFrameType.spec, json(frame.spec));
    }
    case 'start': {
      return encodeWindowsFrame(windowsHostFrameType.start);
    }
    case 'input': {
      return encodeWindowsFrame(windowsHostFrameType.input, frame.bytes);
    }
    case 'resize': {
      return encodeWindowsFrame(
        windowsHostFrameType.resize,
        json({ columns: frame.size.columns, rows: frame.size.rows }),
      );
    }
    case 'terminate': {
      return encodeWindowsFrame(windowsHostFrameType.terminate);
    }
    case 'close-input': {
      return encodeWindowsFrame(windowsHostFrameType.closeInput);
    }
  }
};

/**
 * A streaming frame decoder: bytes in, whole frames out, in order. A partial frame waits for the rest.
 *
 * @public
 */
export type WindowsFrameDecoder = Readonly<{
  /** Append bytes; returns every frame they complete. Throws {@link WindowsSandboxProtocolError} on an oversized one. */
  push: (chunk: Uint8Array<ArrayBuffer>) => readonly WindowsRawFrame[];
  /** How many bytes of an incomplete frame are buffered; nonzero when the stream ends means it was cut. */
  pending: () => number;
}>;

/**
 * Create a streaming frame decoder.
 *
 * @public
 * @returns The decoder.
 */
export const createWindowsFrameDecoder = (): WindowsFrameDecoder => {
  let buffered = new Uint8Array(0);
  let failed = false;
  return {
    push: (chunk) => {
      if (failed) {
        throw new WindowsSandboxProtocolError('The frame stream already failed.');
      }
      const joined = new Uint8Array(buffered.byteLength + chunk.byteLength);
      joined.set(buffered, 0);
      joined.set(chunk, buffered.byteLength);
      const frames: WindowsRawFrame[] = [];
      let offset = 0;
      const view = new DataView(joined.buffer);
      while (joined.byteLength - offset >= headerBytes) {
        const type = view.getUint8(offset);
        const length = view.getUint32(offset + 1, true);
        if (length > windowsFramePayloadLimit) {
          failed = true;
          throw new WindowsSandboxProtocolError(`A ${String(length)}-byte frame exceeds the frame limit.`);
        }
        if (joined.byteLength - offset - headerBytes < length) {
          break;
        }
        frames.push({
          type,
          payload: joined.slice(offset + headerBytes, offset + headerBytes + length),
        });
        offset += headerBytes + length;
      }
      buffered = joined.slice(offset);
      return frames;
    },
    pending: () => buffered.byteLength,
  };
};

const pid = z.number().int().positive();

const readySchema = z.object({
  launcherPid: pid,
  runnerPid: pid,
  capabilitySid: z.string().regex(/^S-1-5-21(?:-\d+)+$/u),
  journal: z.string().min(1),
});

const exitSchema = z
  .object({
    exitCode: z.number().int().optional(),
    signal: z.string().min(1).optional(),
  })
  .refine((exit) => (exit.exitCode === undefined) !== (exit.signal === undefined), {
    message: 'An exit names exactly one of exitCode and signal.',
  });

const refusalSchema = z.object({
  status: z.enum(['sandbox-unavailable', 'unsupported']),
  requirement: z.string().min(1).optional(),
  message: z.string(),
  diagnostic: z.string().optional(),
});

const startedSchema = z.object({ shellPid: pid });

const cleanupFailedSchema = z.object({ message: z.string() });

const decoder = new TextDecoder('utf-8', { fatal: true });

const parsed = <Schema extends z.ZodType>(schema: Schema, frame: WindowsRawFrame, name: string): z.infer<Schema> => {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(frame.payload));
  } catch (error) {
    throw new WindowsSandboxProtocolError(`The helper's ${name} frame is not UTF-8 JSON.`, { cause: error });
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new WindowsSandboxProtocolError(`The helper's ${name} frame is malformed: ${result.error.message}`);
  }
  return result.data;
};

/**
 * Interpret one helper-to-host frame.
 *
 * @public
 * @param frame - The raw frame.
 * @returns The typed frame.
 * @throws {@link WindowsSandboxProtocolError} for an unknown type or a malformed payload.
 */
export const decodeWindowsHelperFrame = (frame: WindowsRawFrame): WindowsHelperFrame => {
  switch (frame.type) {
    case windowsHelperFrameType.ready: {
      return { type: 'ready', ready: parsed(readySchema, frame, 'ready') };
    }
    case windowsHelperFrameType.stdout: {
      return { type: 'stdout', bytes: frame.payload };
    }
    case windowsHelperFrameType.stderr: {
      return { type: 'stderr', bytes: frame.payload };
    }
    case windowsHelperFrameType.output: {
      return { type: 'output', bytes: frame.payload };
    }
    case windowsHelperFrameType.exit: {
      const exit = parsed(exitSchema, frame, 'exit');
      return {
        type: 'exit',
        exit: exit.signal === undefined ? { exitCode: exit.exitCode! } : { signal: exit.signal },
      };
    }
    case windowsHelperFrameType.refused: {
      const refusal = parsed(refusalSchema, frame, 'refused');
      return {
        type: 'refused',
        refusal: {
          status: refusal.status,
          message: refusal.message,
          ...(refusal.requirement === undefined ? {} : { requirement: refusal.requirement }),
          ...(refusal.diagnostic === undefined ? {} : { diagnostic: refusal.diagnostic }),
        },
      };
    }
    case windowsHelperFrameType.started: {
      return {
        type: 'started',
        shellPid: parsed(startedSchema, frame, 'started').shellPid,
      };
    }
    case windowsHelperFrameType.cleanupFailed: {
      return {
        type: 'cleanup-failed',
        message: parsed(cleanupFailedSchema, frame, 'cleanup-failed').message,
      };
    }
    default: {
      throw new WindowsSandboxProtocolError(`The helper sent an unknown frame type 0x${frame.type.toString(16)}.`);
    }
  }
};

const requirements: ReadonlySet<string> = new Set<ShellRequirement>([
  'platform',
  'filesystem-mask',
  'network-isolation',
  'descendant-containment',
  'environment',
  'terminal',
]);

/**
 * Whether a helper refusal names a requirement the provider seam knows.
 *
 * @public
 * @param requirement - The refusal's requirement.
 * @returns Whether it is a {@link ShellRequirement}.
 */
export const isShellRequirement = (requirement: string | undefined): requirement is ShellRequirement =>
  requirement !== undefined && requirements.has(requirement);

/**
 * Build the JSON launch spec for one admitted launch.
 *
 * @public
 * @param launch - The launch, already admitted by the provider.
 * @param extra - The journal path, and the baseline read-deny set the provider adds to every launch.
 * @returns The spec.
 */
export const windowsLaunchSpec = (
  launch: Pick<
    ShellLaunch,
    'executablePath' | 'arguments' | 'workingDirectory' | 'environment' | 'stdio' | 'filesystem'
  >,
  extra: Readonly<{
    journal: string;
    baselineDenied?: readonly string[] | undefined;
  }>,
): WindowsLaunchSpec => ({
  version: windowsSandboxProtocolVersion,
  executable: launch.executablePath,
  arguments: [...launch.arguments],
  workingDirectory: launch.workingDirectory,
  environment: { ...launch.environment },
  stdio:
    launch.stdio.kind === 'pipes'
      ? { kind: 'pipes' }
      : {
          kind: 'terminal',
          columns: launch.stdio.size.columns,
          rows: launch.stdio.size.rows,
        },
  filesystem: {
    readable: [...launch.filesystem.readable],
    writable: [...launch.filesystem.writable],
    readOnly: [...(launch.filesystem.readOnly ?? [])],
    denied: [...new Set([...launch.filesystem.denied, ...(extra.baselineDenied ?? [])])],
  },
  journal: extra.journal,
});

/**
 * Exit codes a Windows process can end with before any of its own code runs (NTSTATUS values, as Node reports them),
 * and what each says about the helper.
 */
const windowsProcessFailures: ReadonlyMap<number, string> = new Map([
  [
    0xc0_00_01_42,
    'STATUS_DLL_INIT_FAILED: Windows could not start it, so it could not say why; a window station or desktop that no longer admits the person is the usual cause',
  ],
  [0xc0_00_01_35, 'STATUS_DLL_NOT_FOUND: a DLL it needs is missing'],
  [0xc0_00_00_05, 'STATUS_ACCESS_VIOLATION: it crashed'],
  [0xc0_00_04_09, 'STATUS_STACK_BUFFER_OVERRUN: it aborted'],
]);

/**
 * How a helper that ended without a frame ended: its exit code, in hex with the NTSTATUS name and meaning when it is
 * one Windows ends a process with before the process can report anything, or the signal.
 *
 * @param code - The exit code Node reported, or `undefined` with a signal.
 * @param signal - The signal Node reported, or `undefined` with a code.
 * @returns Text for a refusal's message.
 */
export const windowsHelperEnd = (code: number | undefined, signal: string | undefined): string => {
  if (code === undefined) {
    return `signal ${String(signal)}`;
  }
  /* Node may report an NTSTATUS as a negative 32-bit value. */
  const status = code < 0 ? code + 2 ** 32 : code;
  const known = windowsProcessFailures.get(status);
  return known === undefined
    ? `exit ${String(code)}`
    : `exit ${String(code)}, 0x${status.toString(16).toUpperCase()} ${known}`;
};
