import {
  gitReceiveRefusalCodes,
  hookCodeLinePrefix,
  hookRefusalCodes,
  retiredAuthorshipRefusals,
} from '#git.constants.js';
import type { GitReceiveRefusalCode, HookRefusalCode, RetiredAuthorshipRefusal } from '#git.constants.js';

/**
 * What tau-api reads from a refused push's report (cloud backup admission blueprint D12, WP2a): the codes the
 * `pre-receive` hook printed, git's own unpack failures, and the retired authorship sentences a rolled-back
 * worker prints without a code. It reads no sentence into a log or a metric: only codes and counts leave here.
 */

/**
 * A refused push printed no code line and none of the retired sentences: the client cannot classify it and shows
 * `attention` (contracts § 6).
 */
export const unknownHookRefusal = 'unknown';

/** A `Tau-Code` line named a code this build does not declare. */
export const otherHookRefusal = 'other';

/** Every value tau-api counts a refused push under, in the order `tau.sync.hook_refusals` declares them. */
export const countedHookRefusalCodes = [
  ...(Object.keys(hookRefusalCodes) as HookRefusalCode[]),
  ...(Object.keys(retiredAuthorshipRefusals) as RetiredAuthorshipRefusal[]),
  ...gitReceiveRefusalCodes,
  unknownHookRefusal,
  otherHookRefusal,
] as const;

/**
 * The codes a backup rule pages on whatever the first-backup flag says: the retired authorship codes (a worker
 * below WP2a, whose refusals carry `first_backup="unknown"`), `unknown`, `other`, and `GIT_PUSH_CHECK_FAILED`
 * (`backup-check-repeat`). tau-api seeds them for every flag so `increase()` sees the first one after a restart.
 */
export const unflaggedPagingRefusalCodes = [
  ...(Object.keys(retiredAuthorshipRefusals) as RetiredAuthorshipRefusal[]),
  'GIT_PUSH_CHECK_FAILED',
  unknownHookRefusal,
  otherHookRefusal,
] as const;

export type CountedHookRefusalCode =
  | HookRefusalCode
  | RetiredAuthorshipRefusal
  | GitReceiveRefusalCode
  | typeof unknownHookRefusal
  | typeof otherHookRefusal;

/** One code a refused push carried, and how many refusals the hook filed under it. */
export type HookRefusalCount = Readonly<{
  code: CountedHookRefusalCode;
  count: number;
}>;

/** A push the hook or git's receive refused. */
export type HookRefusal = Readonly<{
  /** Each distinct code once, in the order the hook ranked them. */
  codes: readonly HookRefusalCount[];
  /** Whether any code is one no retry carrying the same history can clear. */
  terminal: boolean;
}>;

/** The words git prints when `receive.maxInputSize` stops a pack (`storage-git.service.ts`). */
const packTooLarge = 'pack exceeds maximum allowed size';

const declared: ReadonlySet<string> = new Set(countedHookRefusalCodes);

/** Codes whose refusal no retry carrying the same history can clear (contracts § 5, § 6). */
const terminalCodes: ReadonlySet<CountedHookRefusalCode> = new Set<CountedHookRefusalCode>([
  ...(Object.entries(hookRefusalCodes)
    .filter(([, entry]) => entry.class === 'terminal')
    .map(([code]) => code) as HookRefusalCode[]),
  ...(Object.keys(retiredAuthorshipRefusals) as RetiredAuthorshipRefusal[]),
  ...gitReceiveRefusalCodes,
]);

/**
 * One pkt-line stream's payloads, in order. Stops at the first bytes that are not a pkt-line, so a body that is
 * not a report reads as no lines rather than throwing.
 *
 * @param bytes - The stream.
 * @returns Each payload, flush and delimiter packets skipped.
 */
const packets = (bytes: Uint8Array<ArrayBuffer>): Array<Uint8Array<ArrayBuffer>> => {
  const payloads: Array<Uint8Array<ArrayBuffer>> = [];
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const length = text.toString('latin1', offset, offset + 4);
    if (!/^[\da-f]{4}$/u.test(length)) {
      break;
    }
    const size = Number.parseInt(length, 16);
    if (size < 4) {
      offset += 4;
      continue;
    }
    if (offset + size > bytes.length) {
      break;
    }
    payloads.push(bytes.subarray(offset + 4, offset + size));
    offset += size;
  }
  return payloads;
};

/**
 * A receive-pack response split into git's report-status lines and the messages the hook and git printed. With
 * `side-band-64k` (every git client asks for it on push) the report travels in band 1 as pkt-lines of its own and
 * the messages in band 2, either of which may be cut across packets.
 *
 * @param report - The response body, verbatim.
 * @returns The report-status lines and the message lines, trimmed.
 */
const readReport = (report: Uint8Array<ArrayBuffer>): { status: string[]; messages: string[] } => {
  const outer = packets(Buffer.from(report));
  const bandOne: Array<Uint8Array<ArrayBuffer>> = [];
  const bandTwo: Array<Uint8Array<ArrayBuffer>> = [];
  const plain: Array<Uint8Array<ArrayBuffer>> = [];
  for (const payload of outer) {
    const band = payload[0];
    if (band === 1) {
      bandOne.push(payload.subarray(1));
    } else if (band === 2 || band === 3) {
      bandTwo.push(payload.subarray(1));
    } else {
      plain.push(payload);
    }
  }
  const statusPayloads = bandOne.length > 0 ? packets(Buffer.concat(bandOne)) : plain;
  const status = statusPayloads
    .map((payload) => Buffer.from(payload).toString('utf8').trim())
    .filter((line) => line !== '');
  const messages = Buffer.concat(bandTwo)
    .toString('utf8')
    .split(/\r\n|\r|\n/u)
    .map((line) => line.replace(/^remote:\s*/u, '').trim())
    .filter((line) => line !== '');
  return { status, messages };
};

/**
 * Reads a refused push's codes from its receive-pack report.
 *
 * A push counts when git's report says the hook declined a ref or the pack did not unpack. A ref git itself
 * refused for a moved ref (a lost compare-and-swap) is not a hook refusal and reads as none.
 *
 * @param report - The receive-pack response body, verbatim.
 * @returns The codes and whether any is terminal; `undefined` for a push the hook did not refuse.
 */
export const readHookRefusal = (report: Uint8Array<ArrayBuffer>): HookRefusal | undefined => {
  const { status, messages } = readReport(report);
  const unpackFailed = status.some((line) => line.startsWith('unpack ') && line !== 'unpack ok');
  const hookDeclined = status.some((line) => line.startsWith('ng ') && /hook declined/iu.test(line));
  if (!unpackFailed && !hookDeclined) {
    return undefined;
  }
  const counts = new Map<CountedHookRefusalCode, number>();
  const add = (code: CountedHookRefusalCode, count: number): void => {
    counts.set(code, (counts.get(code) ?? 0) + count);
  };
  if (unpackFailed) {
    const text = [...status, ...messages].join('\n');
    add(text.includes(packTooLarge) ? 'GIT_PUSH_TOO_LARGE' : 'GIT_PUSH_OBJECT_INVALID', 1);
  } else {
    for (const line of messages) {
      if (!line.startsWith(hookCodeLinePrefix.trim())) {
        continue;
      }
      const match = /^Tau-Code:\s*(?<code>\S+)(?:\s+(?<count>\d+))?\s*$/u.exec(line);
      const code = match?.groups?.['code'];
      if (code === undefined) {
        continue;
      }
      const count = Number(match?.groups?.['count'] ?? '1');
      add(declared.has(code) ? (code as CountedHookRefusalCode) : otherHookRefusal, count > 0 ? count : 1);
    }
    if (counts.size === 0) {
      /* An uncoded refusal: a worker below WP2a prints the retired sentences and no code. */
      for (const [code, sentence] of Object.entries(retiredAuthorshipRefusals)) {
        const lines = messages.filter((line) => line.includes(sentence)).length;
        if (lines > 0) {
          add(code as RetiredAuthorshipRefusal, lines);
        }
      }
    }
    if (counts.size === 0) {
      add(unknownHookRefusal, 1);
    }
  }
  const codes = [...counts].map(([code, count]) => Object.freeze({ code, count }));
  return Object.freeze({
    codes,
    terminal: codes.some(({ code }) => terminalCodes.has(code)),
  });
};
