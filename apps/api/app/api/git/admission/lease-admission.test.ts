import { describe, expect, it } from 'vitest';
import { decideAdmission, LeaseAdmission } from '#api/git/admission/lease-admission.js';
import type { AdmissionResult, LeaseTicket } from '#api/git/admission/lease-admission.js';

const mebibyte = 1024 ** 2;
const gibibyte = 1024 ** 3;
const stagingFree = Math.round(7.3 * gibibyte);

/** A disk whose free bytes the test sets, and which loses what each admitted lease writes. */
const fakeDisk = (initial: number): { free: number; read: () => Promise<number> } => {
  const disk = {
    free: initial,
    read: async (): Promise<number> => disk.free,
  };
  return disk;
};

const ticketOf = (result: AdmissionResult): LeaseTicket => {
  if (!result.admitted) {
    throw new Error(`expected an admission, got ${result.refusal}`);
  }
  return result.ticket;
};

describe('decideAdmission', () => {
  const idle = { freeBytes: 10 * gibibyte, reservedBytes: 0, landedBytes: 0, ownerLeases: 0, ownerReservedBytes: 0 };

  it('admits whatever fits in free disk less what admitted leases have still to write', () => {
    expect(decideAdmission({ ...idle, reservationBytes: 10 * gibibyte })).toEqual({ admitted: true });
    expect(decideAdmission({ ...idle, reservationBytes: 10 * gibibyte + 1 })).toEqual({
      admitted: false,
      refusal: 'disk_full',
    });
    expect(
      decideAdmission({ ...idle, reservedBytes: 4 * gibibyte, ownerLeases: 0, reservationBytes: 6 * gibibyte + 1 }),
    ).toEqual({ admitted: false, refusal: 'disk_full' });
  });

  it('does not count twice what admitted leases already wrote, which statfs no longer reports as free', () => {
    /* 4 GiB reserved, 3 GiB of it already on disk: statfs dropped from 10 to 7, and 1 GiB is still owed. */
    const busy = { ...idle, freeBytes: 7 * gibibyte, reservedBytes: 4 * gibibyte, landedBytes: 3 * gibibyte };

    expect(decideAdmission({ ...busy, reservationBytes: 6 * gibibyte })).toEqual({ admitted: true });
    expect(decideAdmission({ ...busy, reservationBytes: 6 * gibibyte + 1 })).toEqual({
      admitted: false,
      refusal: 'disk_full',
    });
  });

  it('holds an owner that already has a lease to half the lease disk, whatever the slot count', () => {
    const owner = { ...idle, reservedBytes: 4 * gibibyte, ownerLeases: 1, ownerReservedBytes: 4 * gibibyte };

    expect(decideAdmission({ ...owner, reservationBytes: gibibyte })).toEqual({ admitted: true });
    expect(decideAdmission({ ...owner, reservationBytes: gibibyte + 1 })).toEqual({
      admitted: false,
      refusal: 'owner_busy',
    });
    /* An owner's first lease is never held to the share: a lone large repository still fits. */
    expect(decideAdmission({ ...idle, reservationBytes: 8 * gibibyte })).toEqual({ admitted: true });
  });

  it('reports disk_full before owner_busy, as the flat rule did', () => {
    expect(
      decideAdmission({
        ...idle,
        reservedBytes: 9 * gibibyte,
        ownerLeases: 3,
        ownerReservedBytes: 9 * gibibyte,
        reservationBytes: 2 * gibibyte,
      }),
    ).toEqual({ admitted: false, refusal: 'disk_full' });
  });
});

describe('LeaseAdmission', () => {
  it('admits at least sixteen KiB-repository leases for one owner on 7.3 GiB of free disk', async () => {
    const disk = fakeDisk(stagingFree);
    const admission = new LeaseAdmission({ readFreeBytes: disk.read });
    const tickets: LeaseTicket[] = [];

    for (let lease = 0; lease < 16; lease += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each admission is taken before the next is asked for
      tickets.push(ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: 64 * mebibyte + 1024 })));
    }

    expect(admission.leases).toBe(16);
    expect(admission.reservedBytes).toBe(16 * (64 * mebibyte + 1024));
    for (const ticket of tickets) {
      ticket.release();
    }
    expect(admission.leases).toBe(0);
    expect(admission.reservedBytes).toBe(0);
  });

  it('gives an owner holding one lease a second when the disk is plentiful', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(stagingFree).read });

    const first = ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: 64 * mebibyte }));
    const second = await admission.admit({ ownerId: 'owner-a', reservationBytes: 64 * mebibyte });

    expect(second).toMatchObject({ admitted: true, waited: false });
    first.release();
    ticketOf(second).release();
  });

  it('keeps one owner to half the lease disk so another owner is still admitted', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(8 * gibibyte).read, waitMilliseconds: 0 });

    const held = [
      ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: 2 * gibibyte })),
      ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: 2 * gibibyte })),
    ];
    await expect(admission.admit({ ownerId: 'owner-a', reservationBytes: 2 * gibibyte })).resolves.toEqual({
      admitted: false,
      refusal: 'owner_busy',
    });
    held.push(ticketOf(await admission.admit({ ownerId: 'owner-b', reservationBytes: 2 * gibibyte })));
    await expect(admission.admit({ ownerId: 'owner-c', reservationBytes: 2 * gibibyte + 1 })).resolves.toEqual({
      admitted: false,
      refusal: 'disk_full',
    });

    for (const ticket of held) {
      ticket.release();
    }
  });

  it('reserves a 1 GiB fetch at its real bytes, so 7.3 GiB holds six at once', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(stagingFree).read, waitMilliseconds: 0 });
    const reservation = gibibyte + 2 * mebibyte + 64 * mebibyte;
    const tickets: LeaseTicket[] = [];

    for (const owner of ['a', 'b', 'c', 'd', 'e', 'f']) {
      // oxlint-disable-next-line no-await-in-loop -- in order, so the seventh sees six reservations
      tickets.push(ticketOf(await admission.admit({ ownerId: `owner-${owner}`, reservationBytes: reservation })));
    }
    await expect(admission.admit({ ownerId: 'owner-g', reservationBytes: reservation })).resolves.toEqual({
      admitted: false,
      refusal: 'disk_full',
    });

    expect(admission.reservedBytes).toBe(6 * reservation);
    for (const ticket of tickets) {
      ticket.release();
    }
  });

  it('stops counting a lease’s hydrated bytes twice once they are on disk', async () => {
    const disk = fakeDisk(4 * gibibyte);
    const admission = new LeaseAdmission({ readFreeBytes: disk.read, waitMilliseconds: 0 });

    const large = ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: 3 * gibibyte }));
    /* The hydrate wrote 3 GiB: statfs now reports 1 GiB free, and the lease owes nothing more. */
    disk.free = gibibyte;
    large.landed(3 * gibibyte);

    const next = await admission.admit({ ownerId: 'owner-b', reservationBytes: gibibyte });
    expect(next.admitted, 'the landed bytes were subtracted from free disk a second time').toBe(true);
    /* A landing larger than the reservation never makes room the disk does not have. */
    large.landed(5 * gibibyte);
    await expect(admission.admit({ ownerId: 'owner-c', reservationBytes: 1 })).resolves.toMatchObject({
      admitted: false,
    });

    large.release();
    ticketOf(next).release();
  });

  it('waits a short, bounded time for a release before refusing', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(gibibyte).read, waitMilliseconds: 2000 });
    const held = ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: gibibyte }));

    const waiting = admission.admit({ ownerId: 'owner-b', reservationBytes: gibibyte });
    setTimeout(() => {
      held.release();
    }, 20);

    const result = await waiting;
    expect(result).toMatchObject({ admitted: true, waited: true });
    ticketOf(result).release();
  });

  it('refuses once the wait has run out, and the refused request holds nothing', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(gibibyte).read, waitMilliseconds: 50 });
    const held = ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: gibibyte }));
    const startedAt = performance.now();

    await expect(admission.admit({ ownerId: 'owner-b', reservationBytes: 1 })).resolves.toEqual({
      admitted: false,
      refusal: 'disk_full',
    });

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(45);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(admission.leases).toBe(1);
    held.release();
  });

  it('gives a release back once, however often it is called', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(gibibyte).read });
    const ticket = ticketOf(await admission.admit({ ownerId: 'owner-a', reservationBytes: mebibyte }));

    ticket.release();
    ticket.release();

    expect(admission.leases).toBe(0);
    expect(admission.reservedBytes).toBe(0);
    expect(admission.ownerLeases('owner-a')).toBe(0);
  });

  it('decides and reserves in one step, so concurrent admissions cannot both take the last room', async () => {
    const admission = new LeaseAdmission({ readFreeBytes: fakeDisk(gibibyte).read, waitMilliseconds: 0 });

    const results = await Promise.all(
      ['a', 'b', 'c'].map(async (owner) =>
        admission.admit({ ownerId: `owner-${owner}`, reservationBytes: 600 * mebibyte }),
      ),
    );

    expect(results.filter((result) => result.admitted)).toHaveLength(1);
    for (const result of results) {
      if (result.admitted) {
        result.ticket.release();
      }
    }
  });
});
