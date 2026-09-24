/**
 * Who a revision is attributed to when nobody is signed in (P29, A26, EQ8).
 *
 * The pseudonym has to be stable for one device in one workspace and different
 * for another device, or two people on a shared workspace become one identity
 * in its history — which is worse than anonymity, it is a false identity.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { deviceId, deviceIdStorageKey } from '#lib/device-id.js';
import { githubNoreplyAuthor } from '#lib/github-project-binding.js';
import { revisionUserActor } from '#lib/revision-actor.js';

const asDevice = (id: string): void => {
  globalThis.localStorage.setItem(deviceIdStorageKey, id);
};

describe('revisionUserActor', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('gives two signed-out devices in one workspace two identities', () => {
    asDevice('device-a');
    const first = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    asDevice('device-b');
    const second = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });

    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe('Anonymous');
    expect(first.anonymous).toBe(true);
    /* No mailbox: the identifying half is what an anonymous actor never carries. */
    expect(first.email).toBeUndefined();
  });

  it('keeps one device one identity in a workspace, and a different one in another', () => {
    asDevice('device-a');
    const studio = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    const again = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    const other = revisionUserActor({ workspace: 'other', user: undefined, anonymous: false });

    expect(again.id).toBe(studio.id);
    expect(other.id).not.toBe(studio.id);
  });

  it('hides a signed-in person behind the same pseudonym on every device', () => {
    asDevice('device-a');
    const person = { id: 'user-1', name: 'Lane Person' };
    const first = revisionUserActor({ workspace: 'studio', user: person, anonymous: true });
    asDevice('device-b');
    const second = revisionUserActor({ workspace: 'studio', user: person, anonymous: true });

    /* Anonymity hides *who*, not *where from*: one person is one Anonymous in a
     * workspace however many devices they record from. */
    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false }).id);
  });

  it('records the signed-in person, without an account address, when anonymity is off (D33)', () => {
    const actor = revisionUserActor({
      workspace: 'studio',
      user: { id: 'user-1', name: 'Lane Person' },
      anonymous: false,
    });

    /* The git author falls back to `user-1@users.noreply.tau.new`. */
    expect(actor).toStrictEqual({ kind: 'user', id: 'user-1', name: 'Lane Person' });
  });

  it('authors a GitHub-linked project with the no-reply identity and keeps the Tau user id (D33)', () => {
    const person = { id: 'user-1', name: 'Lane Person' };
    const commitIdentity = githubNoreplyAuthor(42, 'lane');

    expect(revisionUserActor({ workspace: 'studio', user: person, anonymous: false, commitIdentity })).toStrictEqual({
      kind: 'user',
      id: 'user-1',
      name: 'lane',
      email: '42+lane@users.noreply.github.com',
    });
    /* Anonymity still wins: no address of any kind is recorded. */
    expect(
      revisionUserActor({ workspace: 'studio', user: person, anonymous: true, commitIdentity }).email,
    ).toBeUndefined();
  });

  it('keeps one device id across reads', () => {
    const first = deviceId();
    expect(deviceId()).toBe(first);
  });
});
