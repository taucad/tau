import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliError, emit, exitCodeFor, exitCodes, isClassifiedFailure, sanitize, writeStdout } from '#output.js';

type WriteCallback = (error?: Error) => void;

const stubStdout = (settle: (callback: WriteCallback) => void) =>
  vi.spyOn(process.stdout, 'write').mockImplementation(((
    _chunk: string | Uint8Array<ArrayBuffer>,
    ...rest: readonly unknown[]
  ): boolean => {
    const callback = rest.at(-1);
    if (typeof callback === 'function') {
      settle(callback as WriteCallback);
    }
    return true;
  }) as typeof process.stdout.write);

describe('exitCodeFor', () => {
  it('should return the exit code a CliError carries', () => {
    expect(exitCodeFor(cliError('INPUT_NOT_FOUND', 'missing', exitCodes.refused))).toBe(3);
    expect(exitCodeFor(cliError('ARG_JSON_INVALID', 'bad argv', exitCodes.usage))).toBe(2);
  });

  it('should map every citty argv failure to the usage code', () => {
    const argvFailure = Object.assign(new Error('Unknown command bogus'), { name: 'CLIError' });

    expect(exitCodeFor(argvFailure)).toBe(exitCodes.usage);
  });

  it('should map an unclassified throw to the generic error code', () => {
    expect(exitCodeFor(new Error('worker crashed'))).toBe(exitCodes.error);
    expect(exitCodeFor('not an object')).toBe(exitCodes.error);
    expect(exitCodeFor(undefined)).toBe(exitCodes.error);
  });
});

describe('isClassifiedFailure', () => {
  it('should separate CLI-raised failures from unexpected crashes so only the latter print a stack', () => {
    expect(isClassifiedFailure(cliError('EXPORT_FAILED', 'Export failed: boom'))).toBe(true);
    expect(isClassifiedFailure(Object.assign(new Error('Unknown command'), { name: 'CLIError' }))).toBe(true);
    expect(isClassifiedFailure(new Error('worker crashed'))).toBe(false);
    expect(isClassifiedFailure('not an object')).toBe(false);
  });
});

describe('cliError', () => {
  it('should default to the generic error code and keep its message and code', () => {
    const failure = cliError('EXPORT_FAILED', 'Export failed: boom');

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe('Export failed: boom');
    expect(failure.code).toBe('EXPORT_FAILED');
    expect(exitCodeFor(failure)).toBe(exitCodes.error);
  });
});

describe('sanitize', () => {
  const escape = '\u001B';

  it('should strip colour, cursor, and OSC introducers from untrusted display text', () => {
    expect(sanitize(`${escape}[36mkernel${escape}[39m ready`)).toBe('kernel ready');
    expect(sanitize(`a${escape}[2Jb`)).toBe('ab');
    // The OSC introducer is consumed, so the terminal never sees a command; the residue is inert text.
    const osc = sanitize(`${escape}]0;pwned${escape}\u0007title`);
    expect(osc).toBe('wnedtitle');
    expect(osc).not.toContain(escape);
  });

  it('should strip control bytes while preserving tabs and newlines', () => {
    expect(sanitize('one\ttwo\nthree\u0000\u009B')).toBe('one\ttwo\nthree');
  });

  it('should strip the bidirectional overrides that reorder a line without a control byte', () => {
    // `codex login` reads as `nigol xedoc` in a terminal that honours the override.
    expect(sanitize('codex \u202Enigol\u202C')).toBe('codex nigol');
    expect(sanitize('\u2066a\u2069\u200E\u200F')).toBe('a');
    // CVE-2021-42574's set includes the arabic letter mark, which reorders the same way.
    expect(sanitize('tau \u061Cdiff')).toBe('tau diff');
  });
});

describe('writeStdout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve only once the chunk has reached the sink', async () => {
    let flush: WriteCallback | undefined;
    const write = stubStdout((callback) => {
      flush = callback;
    });
    const pending = writeStdout('result\n');
    await Promise.resolve();

    expect(write).toHaveBeenCalledOnce();
    expect(await Promise.race([pending, Promise.resolve('unflushed')])).toBe('unflushed');

    flush?.();

    await expect(pending).resolves.toBeUndefined();
  });

  it('should resolve silently when the reader closed the pipe', async () => {
    stubStdout((callback) => {
      callback(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    });

    await expect(writeStdout('result\n')).resolves.toBeUndefined();
  });

  it('should reject a write failure that is not a closed pipe', async () => {
    stubStdout((callback) => {
      callback(Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
    });

    await expect(writeStdout('result\n')).rejects.toThrow('disk full');
  });
});

describe('emit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write one versioned newline-terminated record to stdout', async () => {
    const write = stubStdout((callback) => {
      callback();
    });

    await emit({ kind: 'export', ok: true, artifacts: [] });

    const [chunk] = write.mock.calls[0] ?? [];
    expect(chunk).toBe('{"v":1,"kind":"export","ok":true,"artifacts":[]}\n');
    expect(JSON.parse(String(chunk))).toMatchObject({ v: 1, kind: 'export', ok: true });
  });
});
