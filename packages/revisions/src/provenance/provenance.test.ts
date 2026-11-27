/**
 * The provenance module against the blueprint's device-state rows (D4, D5,
 * failure-mode table rows 1 to 16), R2-5 and R2-6, and the account-id shapes
 * of Finding 15. Each expectation is the blueprint's "Once backed up" column,
 * written by hand; the golden corpus (`corpus.test.ts`) pins the same answers
 * byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { attributionOf, historyNewArguments, isAccountShaped, readCommit, readTag } from '#provenance/index.js';
import type { Join, Viewer } from '#provenance/index.js';
import { claimMatches, coverageOf } from '#provenance/server.js';

const pusher = 'user_PusherAccountIdA12345';
const other = 'user_OtherAccountIdC123456';
const legacyAccount = 'Legacy32AccountId000000000000AB0';
const handle = 'LOCAL-HANDLE';
const devicePseudonym = 'anon:5e1ea5ed';
const accountPseudonym = 'anon:0ac5a17e';
const tau = 'Tau <noreply@tau.new>';
const noreply = (id: string): string => `${id}@users.noreply.tau.new`;

const commit = (
  input: Readonly<{
    author: string;
    committer?: string;
    message: string;
    extra?: string;
  }>,
): string =>
  [
    `tree ${'a'.repeat(40)}`,
    `parent ${'b'.repeat(40)}`,
    `author ${input.author} 1790000000 +0000`,
    `committer ${input.committer ?? tau} 1790000000 +0000`,
    ...(input.extra === undefined ? [] : [input.extra]),
    '',
    input.message,
  ].join('\n');

const v2 = (actor: Record<string, unknown>, source = 'user'): string =>
  `Saved\n\nTau-Metadata: ${JSON.stringify({
    version: 2,
    parents: [],
    provenance: {
      source,
      actor,
      capture: 'save',
      via: 'desktop',
      createdAt: 1,
    },
    summary: { generated: 'Saved' },
  })}\n`;

const v1 = (actorId: string): string =>
  `Saved\n\nTau-Metadata: ${JSON.stringify({
    version: 1,
    parents: [],
    provenance: {
      source: 'user',
      actorId,
      actor: { kind: 'user', id: actorId, name: actorId },
      trigger: 'idle',
      createdAt: 1,
    },
    summary: { generated: 'Saved changes (idle)' },
  })}\nTau-Actor: user ${actorId}\nTau-Trigger: idle\n`;

const owner: Viewer = {
  accountId: pusher,
  owner: true,
  sharedProject: true,
  deviceIdentities: [handle, devicePseudonym],
};
const member: Viewer = {
  accountId: 'user_MemberAccountIdB12345',
  owner: false,
  sharedProject: true,
  deviceIdentities: [],
};
const pushed = (bits: Record<string, true> = {}, extra: Record<string, unknown> = {}): Join => ({
  push: {
    generation: 3,
    pusher: { kind: 'account', accountId: pusher },
    viaDevice: false,
    ...extra,
  },
  bits,
});
const inputs = {
  pusher,
  identities: [handle, devicePseudonym, 'Jordan Lee'],
  verifiedEmail: 'pusher@example.com',
  forgeId: '583231',
};
/** The join the server would serve after admitting `body` with the grant's inputs. */
const admitted = (body: string): Join => pushed(coverageOf(body, inputs) as Record<string, true>);

describe('readCommit', () => {
  it('reads a version 2 record and classifies addresses without returning one', () => {
    const reading = readCommit(
      commit({
        author: `Pusher <${noreply(pusher)}>`,
        message: v2({ kind: 'user', id: pusher, name: 'Pusher' }),
      }),
    );
    expect(reading).toMatchObject({
      shape: 'tau/2',
      tauWritten: true,
      person: { id: pusher, name: 'Pusher' },
      authorAccountId: pusher,
      namesAccount: true,
      pseudonymous: false,
    });
    expect(reading.claimable).toBeUndefined();
    expect(reading.addressClass).toEqual({
      author: 'tau',
      committer: 'tau',
      tagger: 'none',
      trailers: 'none',
    });
    expect(JSON.stringify(reading)).not.toContain('@');
  });

  it('accepts the forge identity ui@0.9.x wrote into the person, and never returns its address (I10, I11)', () => {
    const reading = readCommit(
      commit({
        author: 'pusher-gh <583231+pusher-gh@users.noreply.github.com>',
        message: v2({
          kind: 'user',
          id: pusher,
          name: 'pusher-gh',
          email: '583231+pusher-gh@users.noreply.github.com',
        }),
      }),
    );
    expect(reading.shape).toBe('tau/2');
    expect(reading.addressClass.author).toBe('forge');
    expect(JSON.stringify(reading)).not.toContain('@');
  });

  it.each([
    ['version 1', v1(handle)],
    ['corrupt JSON', 'Saved\n\nTau-Metadata: {not json\n'],
    [
      'version 3',
      `Saved\n\nTau-Metadata: ${JSON.stringify({ version: 3, provenance: { actor: { kind: 'user', id: 'x' } } })}\n`,
    ],
    ['a version 2 record naming no one', 'Saved\n\nTau-Metadata: {"version":2}\n'],
    ['two record lines', `${v2({ kind: 'user', id: pusher })}Tau-Metadata: {"version":2}\n`],
  ])('classifies %s as tau/other from its headers', (_label, message) => {
    expect(readCommit(commit({ author: `${handle} <${noreply(handle)}>`, message })).shape).toBe('tau/other');
  });

  it('is total: garbage reads as a commit with no account', () => {
    for (const body of ['', '\n\n', 'author', 'tree x\nauthor <\n\nTau-Metadata: ', '\u0000\u0001']) {
      expect(readCommit(body).namesAccount).toBe(false);
    }
  });

  it('sees an account id written with JSON escapes', () => {
    const escaped = pusher.replace('u', String.raw`\u0075`);
    const message = `Saved\n\nTau-Metadata: {"version":1,"provenance":{"actorId":"${escaped}"}}\n`;
    expect(readCommit(commit({ author: `${handle} <${noreply(handle)}>`, message })).namesAccount).toBe(true);
  });

  it.each([
    ['a 5-character handle', 'abcde', false],
    ['a 21-character handle', 'A'.repeat(21), false],
    ['a 31-character handle', 'A'.repeat(31), false],
    ['a 32-character id from the earlier generator', legacyAccount, true],
    ['a 33-character handle', 'A'.repeat(33), false],
    ['user_ and 20', `user_${'a'.repeat(20)}`, false],
    ['user_ and 21', `user_${'a'.repeat(21)}`, true],
    ['user_ and 22', `user_${'a'.repeat(22)}`, false],
    ['the evidence handle', handle, false],
    ['the agent id', 'agent', false],
  ])('decides whether %s is account-shaped (%s)', (_label, id, shaped) => {
    expect(isAccountShaped(id)).toBe(shaped);
    const reading = readCommit(commit({ author: `${id} <${noreply(id)}>`, message: v1(id) }));
    expect(reading.namesAccount).toBe(shaped);
    expect(reading.claimable).toBe(shaped ? undefined : id);
  });

  it('B1: reads a hostile trailer-shaped message in linear time', () => {
    const blankRun = `Co-Authored-By:${' '.repeat(1024 * 1024)}x`;
    const tokenRun = `Co-Authored-By: ${'a'.repeat(1024 * 1024)} <`;
    const manyLines = Array.from({ length: 20_000 }, () => `Key:${' '.repeat(1000)}<`).join('\n');
    for (const message of [blankRun, tokenRun, manyLines]) {
      const started = performance.now();
      const reading = readCommit(commit({ author: 'A <a@example.com>', message }));
      expect(performance.now() - started).toBeLessThan(250);
      expect(reading.addressClass.trailers).toBe('none');
    }
  });

  it('B1: still reads a trailer whose name has blanks and an address in angle brackets', () => {
    const reading = readCommit(
      commit({ author: 'A <a@example.com>', message: 'Work\n\nCo-Authored-By:  Claude  <noreply@anthropic.com>\t' }),
    );
    expect(reading.agent).toEqual({ id: 'claude-code', by: 'trailer' });
  });

  it('matches recognised agents exactly and ignores look-alikes', () => {
    const trailer = readCommit(
      commit({
        author: `P <${noreply(pusher)}>`,
        committer: `P <${noreply(pusher)}>`,
        message: 'Fix\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n',
      }),
    );
    expect(trailer.agent).toEqual({ id: 'claude-code', by: 'trailer' });
    expect(trailer.addressClass.trailers).toBe('agent');
    const author = readCommit(
      commit({
        author: 'Claude <noreply@anthropic.com>',
        committer: 'Claude <noreply@anthropic.com>',
        message: 'Fix\n',
      }),
    );
    expect(author.agent).toEqual({ id: 'claude-code', by: 'author' });
    for (const lookAlike of [
      'Fix\n\nCo-Authored-By: Claude <noreply@anthropic.co>\n',
      'Fix\n\nCo-Authored-By: Claudette <noreply@anthropic.com>\n',
      'Fix\n\nReviewed-By: Claude <noreply@anthropic.com>\n',
    ]) {
      expect(readCommit(commit({ author: `P <${noreply(pusher)}>`, message: lookAlike })).agent).toBeUndefined();
    }
  });
});

describe('no address and every pusher marker (M2 review M1, M2)', () => {
  const joined = (viaDevice: boolean): Join => ({
    push: { generation: 3, pusher: { kind: 'account', accountId: pusher, former: true }, viaDevice },
    bits: {},
  });
  const member: Viewer = { accountId: other, owner: false, sharedProject: true, deviceIdentities: [] };

  it('returns no name that holds an address, and none becomes claimable', () => {
    for (const author of [
      'alice@example.com <alice@example.com>',
      `X <${noreply(pusher)}> <evil@x.example>`,
      'a<b <c@d.example>',
    ]) {
      const reading = readCommit(commit({ author, message: 'Imported' }));
      expect(reading.authorName, author).toBe('');
      expect(reading.claimable, author).toBeUndefined();
    }
    expect(readCommit(commit({ author: 'Alice Smith <alice@example.com>', message: 'Imported' })).authorName).toBe(
      'Alice Smith',
    );
  });

  it('carries "Former member" and "by a cloud agent" on every answer that names the pusher', () => {
    const imported = readCommit(
      commit({ author: 'Alice <alice@example.com>', committer: 'Alice <alice@example.com>', message: 'Imported' }),
    );
    expect(attributionOf(imported, joined(true), member)).toEqual({
      kind: 'external',
      name: 'Alice',
      backedUpBy: { accountId: pusher, former: true },
      viaDevice: true,
    });
    expect(attributionOf(imported, joined(false), member)).toEqual({
      kind: 'external',
      name: 'Alice',
      backedUpBy: { accountId: pusher, former: true },
    });
    const agentResult = readCommit(
      commit({
        author: `Pusher <${noreply(pusher)}>`,
        message: v2({ kind: 'agent', id: 'claude', runId: 'run_1', onBehalfOf: { kind: 'user', id: pusher } }, 'agent'),
      }),
    );
    expect(attributionOf(agentResult, joined(true), member)).toEqual({
      kind: 'tauAgent',
      for: { accountId: pusher, former: true },
      viaDevice: true,
    });
  });
});

describe('readTag', () => {
  const tag = (message: string): string =>
    `object ${'b'.repeat(40)}\ntype commit\ntag v2\ntagger ${tau} 1 +0000\n\n${message}`;
  it('reads a version 2 Tau-Tag record, as the hook judges it', () => {
    expect(readTag(tag(`Ready\n\nTau-Tag: {"version":2,"id":"${'0'.repeat(32)}","name":"Ready","extra":1}\n`))).toEqual(
      {
        shape: 'tau/2',
        versionId: '0'.repeat(32),
        name: 'Ready',
        target: 'b'.repeat(40),
      },
    );
  });
  it.each([
    ['no record', 'Ready\n'],
    ['no id', 'Ready\n\nTau-Tag: {"version":2,"name":"Ready"}\n'],
    ['an empty name', `Ready\n\nTau-Tag: {"version":2,"id":"${'0'.repeat(32)}","name":""}\n`],
    ['version 1', `Ready\n\nTau-Tag: {"version":1,"id":"${'0'.repeat(32)}","name":"Ready"}\n`],
    ['corrupt JSON', 'Ready\n\nTau-Tag: {\n'],
  ])('reads %s as invalid', (_label, message) => {
    expect(readTag(tag(message)).shape).toBe('invalid');
  });
});

describe('attributionOf against the device-state rows', () => {
  const row = (body: string, join: Join = admitted(body), viewer: Viewer = member) =>
    attributionOf(readCommit(body), join, viewer);

  it('row 1: signed-in work reads as the account on its record', () => {
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          message: v2({ kind: 'user', id: pusher }),
        }),
      ),
    ).toEqual({ kind: 'account', accountId: pusher, basis: 'record' });
  });

  it('row 2: a version 1 record naming the account reads as the account by own git, unparsed', () => {
    expect(row(commit({ author: `P <${noreply(pusher)}>`, message: v1(pusher) }))).toEqual({
      kind: 'account',
      accountId: pusher,
      basis: 'ownGit',
    });
  });

  it('row 3: pre-sign-in desktop work reads "Saved before sign-in" until claimed, then as the account', () => {
    const body = commit({
      author: `${handle} <${noreply(handle)}>`,
      message: v1(handle),
    });
    expect(row(body, pushed())).toEqual({
      kind: 'beforeSignIn',
      backedUpBy: { accountId: pusher },
    });
    expect(row(body)).toEqual({
      kind: 'account',
      accountId: pusher,
      basis: 'claim',
    });
  });

  it('row 4: an environment mailbox reads as the account only when it is the verified sign-in email', () => {
    expect(row(commit({ author: 'Pat <pusher@example.com>', message: v1(handle) }))).toEqual({
      kind: 'account',
      accountId: pusher,
      basis: 'address',
    });
    const elsewhere = commit({
      author: `${handle} <pat@elsewhere.test>`,
      message: v1(handle),
    });
    expect(readCommit(elsewhere).claimable).toBe(handle);
    expect(row(elsewhere, pushed())).toEqual({
      kind: 'beforeSignIn',
      backedUpBy: { accountId: pusher },
    });
  });

  it('row 5: account A recorded, account B backs up: external, not claimable', () => {
    const body = commit({
      author: `Other Person <${noreply(other)}>`,
      message: v2({ kind: 'user', id: other, name: 'Other Person' }),
    });
    expect(readCommit(body).claimable).toBeUndefined();
    expect(row(body, pushed({ claim: true }))).toEqual({
      kind: 'external',
      name: 'Other Person',
      backedUpBy: { accountId: pusher },
    });
  });

  it('row 6 and R2-5: claimed signed-out work reads as the account before the pseudonym step; unclaimed is Anonymous', () => {
    const body = commit({
      author: `Anonymous <${noreply(devicePseudonym)}>`,
      message: v2({
        kind: 'user',
        id: devicePseudonym,
        name: 'Anonymous',
        anonymous: true,
      }),
    });
    expect(readCommit(body)).toMatchObject({
      pseudonymous: true,
      claimable: devicePseudonym,
      namesAccount: false,
    });
    expect(row(body)).toEqual({
      kind: 'account',
      accountId: pusher,
      basis: 'claim',
    });
    expect(row(body, pushed())).toEqual({ kind: 'anonymous' });
    expect(row(body, pushed(), owner)).toEqual({
      kind: 'anonymous',
      backedUpBy: { accountId: pusher },
    });
  });

  it('row 7: anonymity on (account pseudonym) stays Anonymous', () => {
    const body = commit({
      author: `Anonymous <${noreply(accountPseudonym)}>`,
      message: v2({ kind: 'user', id: accountPseudonym, anonymous: true }),
    });
    expect(row(body)).toEqual({ kind: 'anonymous' });
  });

  it('row 8 and R2-6: a Tau agent for the pusher reads "Agent · for pusher"; one forged for another reads external', () => {
    const agent = (onBehalfOf: string) => ({
      kind: 'agent',
      id: 'claude',
      runId: 'run_1',
      onBehalfOf: { kind: 'user', id: onBehalfOf },
    });
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          message: v2(agent(pusher), 'agent'),
        }),
      ),
    ).toEqual({ kind: 'tauAgent', for: { accountId: pusher } });
    expect(
      row(
        commit({
          author: `O <${noreply(other)}>`,
          message: v2(agent(other), 'agent'),
        }),
      ),
    ).toEqual({ kind: 'external', name: 'O', backedUpBy: { accountId: pusher } });
    /* Recorded for another account but authored as the pusher: the record decides, not own git (M2 review m1). */
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          message: v2(agent(other), 'agent'),
        }),
      ),
    ).toEqual({ kind: 'external', name: 'P', backedUpBy: { accountId: pusher } });
  });

  it('row 9: git under the pusher’s Tau no-reply address reads as the account, made with git', () => {
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          committer: `P <${noreply(pusher)}>`,
          message: 'Edit\n',
        }),
      ),
    ).toEqual({ kind: 'account', accountId: pusher, basis: 'ownGit' });
  });

  it('row 10: a personal address reads as the account only when verified, else external', () => {
    expect(
      row(
        commit({
          author: 'P <pusher@example.com>',
          committer: 'P <pusher@example.com>',
          message: 'Edit\n',
        }),
      ),
    ).toMatchObject({ kind: 'account', basis: 'address' });
    expect(
      row(
        commit({
          author: 'P <p@else.test>',
          committer: 'P <p@else.test>',
          message: 'Edit\n',
        }),
      ),
    ).toEqual({ kind: 'external', name: 'P', backedUpBy: { accountId: pusher } });
  });

  it('row 11: the pusher’s own forge commits are the account on the numeric id; other people’s are external', () => {
    expect(
      row(
        commit({
          author: 'pg <583231+pusher-gh@users.noreply.github.com>',
          committer: 'GitHub <noreply@github.com>',
          message: 'Edit\n',
        }),
      ),
    ).toMatchObject({ kind: 'account', basis: 'forge' });
    expect(
      row(
        commit({
          author: 'pg <999+pusher-gh@users.noreply.github.com>',
          committer: 'GitHub <noreply@github.com>',
          message: 'Edit\n',
        }),
      ),
    ).toEqual({ kind: 'external', name: 'pg', backedUpBy: { accountId: pusher } });
  });

  it('row 12: history imported from another host reads external', () => {
    expect(
      row(
        commit({
          author: 'Ada <ada@gitlab.test>',
          committer: 'Ada <ada@gitlab.test>',
          message: 'Import\n',
        }),
      ),
    ).toEqual({ kind: 'external', name: 'Ada', backedUpBy: { accountId: pusher } });
  });

  it('rows 13a to 13c: recognised agents read "for" only when the person half verifies', () => {
    const claude = 'Claude <noreply@anthropic.com>';
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          committer: `P <${noreply(pusher)}>`,
          message: 'Fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
        }),
      ),
    ).toEqual({ kind: 'agent', agent: 'claude-code', for: { accountId: pusher } });
    expect(
      row(
        commit({
          author: claude,
          committer: `P <${noreply(pusher)}>`,
          message: 'Fix\n',
        }),
      ),
    ).toEqual({ kind: 'agent', agent: 'claude-code', for: { accountId: pusher } });
    expect(
      row(
        commit({
          author: claude,
          committer: 'P <pusher@example.com>',
          message: 'Fix\n',
        }),
      ),
    ).toEqual({ kind: 'agent', agent: 'claude-code', for: { accountId: pusher } });
    expect(row(commit({ author: claude, committer: claude, message: 'Fix\n' }))).toEqual({
      kind: 'agent',
      agent: 'claude-code',
      backedUpBy: { accountId: pusher },
    });
    /* A trailer on a commit that does not verify re-owns nobody's work. */
    expect(
      row(
        commit({
          author: 'O <o@else.test>',
          committer: 'O <o@else.test>',
          message: 'Fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
        }),
      ),
    ).toEqual({ kind: 'external', name: 'O', backedUpBy: { accountId: pusher } });
  });

  it('rows 15 and 16: a newer or corrupt record reads by own git when the author is the pusher, else external', () => {
    expect(
      row(
        commit({
          author: `P <${noreply(pusher)}>`,
          message: 'S\n\nTau-Metadata: {"version":3}\n',
        }),
      ),
    ).toMatchObject({ kind: 'account', basis: 'ownGit' });
    expect(
      row(
        commit({
          author: `${handle} <${noreply(handle)}>`,
          message: 'S\n\nTau-Metadata: {oops\n',
        }),
        pushed(),
      ),
    ).toEqual({ kind: 'beforeSignIn', backedUpBy: { accountId: pusher } });
  });

  it('a version 1 record naming an account with an OS-login author is unclaimable', () => {
    const body = commit({
      author: `${handle} <${noreply(handle)}>`,
      message: v1(legacyAccount),
    });
    expect(readCommit(body).claimable).toBeUndefined();
    expect(row(body, pushed({ claim: true }))).toEqual({
      kind: 'external',
      name: handle,
      backedUpBy: { accountId: pusher },
    });
  });

  it('a Windows login with a space is claimable', () => {
    const body = commit({
      author: `Jordan Lee <${noreply('Jordan Lee')}>`,
      message: v1('Jordan Lee'),
    });
    expect(readCommit(body).claimable).toBe('Jordan Lee');
    expect(row(body)).toMatchObject({ kind: 'account', basis: 'claim' });
  });

  it('marks a former member and a host device push', () => {
    const body = commit({
      author: `P <${noreply(pusher)}>`,
      message: v2({ kind: 'user', id: pusher }),
    });
    expect(
      row(body, {
        push: {
          generation: 1,
          pusher: { kind: 'account', accountId: pusher, former: true },
          viaDevice: true,
        },
        bits: {},
      }),
    ).toEqual({
      kind: 'account',
      accountId: pusher,
      basis: 'record',
      former: true,
      viaDevice: true,
    });
  });

  it('reads a hidden push as Anonymous, and unjoined entries never as an account', () => {
    const body = commit({
      author: `P <${noreply(pusher)}>`,
      message: v2({ kind: 'user', id: pusher }),
    });
    expect(
      row(body, {
        push: { generation: 1, pusher: { kind: 'hidden' }, viaDevice: false },
        bits: {},
      }),
    ).toEqual({ kind: 'anonymous' });
    expect(row(body, 'local', owner)).toEqual({ kind: 'local' });
    expect(row(body, 'pending', owner)).toEqual({
      kind: 'pending',
      showLine: true,
    });
    expect(row(body, 'pending', { ...owner, sharedProject: false })).toEqual({
      kind: 'pending',
      showLine: false,
    });
    const device = commit({
      author: `${handle} <${noreply(handle)}>`,
      message: v1(handle),
    });
    expect(row(device, 'local', owner)).toEqual({ kind: 'local' });
    expect(row(device, 'local', member)).toEqual({ kind: 'beforeSignIn' });
  });
});

describe('server half', () => {
  it('covers only an exact claimable identity on a commit naming no account', () => {
    const device = readCommit(commit({ author: `${handle} <${noreply(handle)}>`, message: v1(handle) }));
    expect(claimMatches(device, [handle])).toBe(true);
    expect(claimMatches(device, ['local-handle', `${handle} `])).toBe(false);
    const named = readCommit(commit({ author: `${handle} <${noreply(handle)}>`, message: v1(pusher) }));
    expect(claimMatches(named, [handle])).toBe(false);
  });

  it('returns bits and never an address', () => {
    const bits = coverageOf(
      commit({
        author: 'P <PUSHER@Example.com>',
        committer: 'pg <583231+pusher-gh@users.noreply.github.com>',
        message: 'Edit\n',
      }),
      inputs,
    );
    expect(bits).toEqual({ address: true, committerForge: true });
  });
});

describe('historyNewArguments', () => {
  it('lists new branch and tag tips against every branch and tag tip before, ignoring record refs', () => {
    expect(
      historyNewArguments(
        {
          'refs/heads/main': 'c1',
          'refs/tags/v2': 't1',
          'refs/tau/ops/x': 'r1',
        },
        {
          'refs/heads/main': 'c2',
          'refs/heads/b': 'c1',
          'refs/tags/v2': 't1',
          'refs/tags/v3': 't2',
          'refs/tau/ops/y': 'r2',
        },
      ),
    ).toEqual(['c2', 't2', '--not', 'c1', 't1']);
    expect(
      historyNewArguments({ 'refs/heads/main': 'c1' }, { 'refs/heads/main': 'c1', 'refs/tau/ops/y': 'r2' }),
    ).toEqual([]);
    expect(historyNewArguments({}, { 'refs/heads/main': 'c1' })).toEqual(['c1', '--not']);
  });
});
