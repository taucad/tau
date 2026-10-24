import { describe, expect, it } from 'vitest';
import {
  hydratedBytes,
  pushQuarantineBound,
  reservationFor,
  reservationFloorBytes,
} from '#api/git/admission/reservation.js';
import { livePackBound, repositoryByteCeiling } from '#api/git/store/limits.js';

const mebibyte = 1024 ** 2;
const gibibyte = 1024 ** 3;
/* `quotaOverrunSlackBytes`, which the service passes. */
const slackBytes = 64 * mebibyte;

describe('hydratedBytes', () => {
  it('is the live pack bytes plus the index allowance a hydrate writes beside them', () => {
    expect(hydratedBytes([])).toBe(0);
    /* W0a measured 0.17 % for a stored `.idx`; the allowance is 1/512 (0.195 %), rounded up. */
    expect(hydratedBytes([512, 512])).toBe(1026);
    expect(hydratedBytes([gibibyte])).toBe(gibibyte + 2 * mebibyte);
  });
});

describe('pushQuarantineBound', () => {
  it('is what is left of the plan or of the D20 ceiling, whichever is smaller, plus the overrun slack', () => {
    expect(
      pushQuarantineBound({ planRemainingBytes: 10 * gibibyte, ceilingRemainingBytes: gibibyte, slackBytes }),
    ).toBe(gibibyte + 64 * mebibyte);
    expect(pushQuarantineBound({ planRemainingBytes: 5 * mebibyte, ceilingRemainingBytes: gibibyte, slackBytes })).toBe(
      69 * mebibyte,
    );
    /* At the ceiling a push may still bring the slack, so the hook, not git, words the refusal. */
    expect(pushQuarantineBound({ planRemainingBytes: gibibyte, ceilingRemainingBytes: 0, slackBytes })).toBe(
      64 * mebibyte,
    );
  });
});

describe('reservationFor', () => {
  it('reserves a KiB repository fetch at the floor, so 7.3 GiB of free disk holds well over sixteen', () => {
    const reservation = reservationFor({ kind: 'fetch', packBytes: [398] });

    expect(reservation).toBe(reservationFloorBytes + 399);
    expect(Math.floor((7.3 * gibibyte) / reservation)).toBeGreaterThanOrEqual(16);
  });

  it('reserves a 1 GiB repository fetch at its real bytes, 1.0× plus the index and the floor', () => {
    const packs = [960 * mebibyte, 32 * mebibyte, 32 * mebibyte];

    expect(reservationFor({ kind: 'fetch', packBytes: packs })).toBe(gibibyte + 2 * mebibyte + reservationFloorBytes);
  });

  it('reserves a push as its hydrate plus its quarantine bound when the push cannot compact', () => {
    const packs = Array.from({ length: livePackBound - 1 }, () => mebibyte);
    const quarantine = 100 * mebibyte;

    expect(reservationFor({ kind: 'push', packBytes: packs, quarantineBytes: quarantine })).toBe(
      hydratedBytes(packs) + quarantine + reservationFloorBytes,
    );
  });

  it('adds the `--keep-pack` transient when the arriving pack takes the repository past the pack bound', () => {
    /* One ~965 MiB base and seven small turn-end packs: W0a's realistic shape at the ceiling. */
    const packs = [965 * mebibyte, ...Array.from({ length: livePackBound - 1 }, () => mebibyte)];
    const quarantine = 64 * mebibyte;
    const rewritten = 7 * mebibyte + quarantine;

    const reservation = reservationFor({ kind: 'push', packBytes: packs, quarantineBytes: quarantine });

    expect(reservation).toBe(hydratedBytes(packs) + quarantine + rewritten + reservationFloorBytes);
    /* About 1.08× the repository, plus the quarantine, rather than D33's flat 2.5 GiB. */
    expect(reservation).toBeLessThan(1.25 * gibibyte);
  });

  it('admits a full compaction against its own figure: old and new packs both on disk before the unlink', () => {
    const packs = [512 * mebibyte, 512 * mebibyte];

    expect(reservationFor({ kind: 'compaction', packBytes: packs })).toBe(
      2 * hydratedBytes(packs) + reservationFloorBytes,
    );
    /* At the ceiling it still fits under D33's 2.5 GiB, which was set by exactly this case. */
    expect(reservationFor({ kind: 'compaction', packBytes: [repositoryByteCeiling] })).toBeLessThan(2.5 * gibibyte);
  });

  it('refuses a negative or fractional figure rather than reserving nonsense', () => {
    expect(() => reservationFor({ kind: 'fetch', packBytes: [-1] })).toThrow(RangeError);
    expect(() => reservationFor({ kind: 'push', packBytes: [], quarantineBytes: 1.5 })).toThrow(RangeError);
  });
});
