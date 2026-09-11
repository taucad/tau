import { describe, expect, it, vi } from 'vitest';

import { createHostAdmissionAuthority, HostAdmissionRefusal, hostAdmissionOperations } from '#host/host-admission.js';
import type {
  HostActor,
  HostAdmissionOperation,
  HostSessionHandle,
  IssueHostSessionInput,
} from '#host/host-admission.js';

const scope = { authorityId: 'authority-a', workspaceId: 'workspace-a' } as const;
const actors = [
  { kind: 'user', id: 'user-a' },
  { kind: 'agent', id: 'agent-a' },
] as const satisfies readonly HostActor[];

// @ts-expect-error -- generic commands are not part of the canonical jobs facet.
const removedJobsCommand: HostAdmissionOperation = 'jobs.command';

describe('local host admission', () => {
  it.each(hostAdmissionOperations)('round-trips canonical operation %s', (operation) => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const route = operation.startsWith('jobs.') ? 'jobs' : 'machines';
    const session = authority.issueTrustedSession({
      actor: actors[0],
      ...scope,
      grants: [{ route, operation }],
    });

    expect(authority.admit({ session, ...scope, route, operation }).operation).toBe(operation);
  });

  it.each(actors)('admits the same exact grant for $kind', (actor) => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const session = authority.issueTrustedSession({
      actor,
      ...scope,
      grants: [{ route: 'jobs', operation: 'jobs.submit' }],
    });

    const admitted = authority.admit({ session, ...scope, route: 'jobs', operation: 'jobs.submit' });

    expect(admitted).toMatchObject({ hostId: 'host-a', actor, ...scope, route: 'jobs', operation: 'jobs.submit' });
    expect(() => {
      admitted.assertCurrent();
    }).not.toThrow();
  });

  it('refuses foreign handles, authority/workspace crossover, and absent grants', () => {
    const first = createHostAdmissionAuthority({ hostId: 'host-a' });
    const second = createHostAdmissionAuthority({ hostId: 'host-a' });
    const session = first.issueTrustedSession({
      actor: actors[0],
      ...scope,
      grants: [{ route: 'machines', operation: 'machines.snapshot' }],
    });
    const input = { session, ...scope, route: 'machines', operation: 'machines.snapshot' } as const;

    expect(() => second.admit(input)).toThrow(expect.objectContaining({ code: 'INVALID_SESSION' }));
    expect(() => first.admit({ ...input, authorityId: 'authority-b' })).toThrow(
      expect.objectContaining({ code: 'AUTHORITY_MISMATCH' }),
    );
    expect(() => first.admit({ ...input, workspaceId: 'workspace-b' })).toThrow(
      expect.objectContaining({ code: 'WORKSPACE_MISMATCH' }),
    );
    expect(() => first.admit({ ...input, route: 'jobs', operation: 'jobs.submit' })).toThrow(
      expect.objectContaining({ code: 'ROUTE_DENIED' }),
    );
  });

  it('revokes an admitted operation across an asynchronous boundary', async () => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const session = authority.issueTrustedSession({
      actor: actors[1],
      ...scope,
      grants: [{ route: 'jobs', operation: 'jobs.submit' }],
    });
    const admitted = authority.admit({ session, ...scope, route: 'jobs', operation: 'jobs.submit' });

    await Promise.resolve();
    expect(authority.revoke(session)).toBe(true);
    expect(authority.revoke(session)).toBe(false);
    expect(() => {
      admitted.assertCurrent();
    }).toThrow(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });

  it('rejects malformed/accessor-bearing trusted inputs without executing accessors', () => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const getter = vi.fn(() => actors[0]);
    const accessor = Object.defineProperty(
      { ...scope, grants: [{ route: 'jobs', operation: 'jobs.submit' }] },
      'actor',
      { enumerable: true, get: getter },
    );

    expect(() => authority.issueTrustedSession(accessor as unknown as IssueHostSessionInput)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      authority.issueTrustedSession({
        actor: actors[0],
        ...scope,
        grants: [{ route: 'jobs', operation: 'machines.snapshot' as HostAdmissionOperation }],
      }),
    ).toThrow('INVALID_HOST_GRANT');
  });

  it('reads the bounded grants array only through own data descriptors', () => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const indexGetter = vi.fn(() => ({ route: 'jobs', operation: 'jobs.submit' }));
    const accessor = Object.defineProperty([], '0', { enumerable: true, get: indexGetter });
    Object.defineProperty(accessor, 'length', { value: 1 });
    const iterator = vi.fn(function* () {
      yield { route: 'jobs', operation: 'jobs.submit' };
    });
    const customIterator = [{ route: 'jobs', operation: 'jobs.submit' }];
    Object.defineProperty(customIterator, Symbol.iterator, { value: iterator });
    const issue = (grants: unknown): void => {
      authority.issueTrustedSession({ actor: actors[0], ...scope, grants } as unknown as IssueHostSessionInput);
    };

    expect(() => {
      issue(accessor);
    }).toThrow('INVALID_HOST_GRANTS');
    expect(indexGetter).not.toHaveBeenCalled();
    expect(() => {
      issue(customIterator);
    }).toThrow('INVALID_HOST_GRANTS');
    expect(iterator).not.toHaveBeenCalled();
    const sparse = [undefined];
    Reflect.deleteProperty(sparse, '0');
    expect(() => {
      issue(sparse);
    }).toThrow('INVALID_HOST_GRANTS');
    expect(() => {
      issue(Array.from({ length: 65 }, () => ({ route: 'jobs', operation: 'jobs.submit' })));
    }).toThrow('INVALID_HOST_GRANTS');
    const extra = [{ route: 'jobs', operation: 'jobs.submit' }];
    Object.defineProperty(extra, 'forged', { value: true });
    expect(() => {
      issue(extra);
    }).toThrow('INVALID_HOST_GRANTS');
  });

  it('refuses duplicate grants and the removed generic jobs command', () => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const grant = { route: 'jobs', operation: 'jobs.submit' } as const;
    expect(() => authority.issueTrustedSession({ actor: actors[0], ...scope, grants: [grant, grant] })).toThrow(
      'DUPLICATE_HOST_GRANT',
    );
    expect(() =>
      authority.issueTrustedSession({
        actor: actors[0],
        ...scope,
        grants: [{ route: 'jobs', operation: removedJobsCommand }],
      }),
    ).toThrow('INVALID_HOST_GRANT');
  });

  it('does not accept serializable lookalikes as session handles', () => {
    const authority = createHostAdmissionAuthority({ hostId: 'host-a' });
    const lookalike = structuredClone({}) as HostSessionHandle;

    expect(() => authority.admit({ session: lookalike, ...scope, route: 'jobs', operation: 'jobs.submit' })).toThrow(
      HostAdmissionRefusal,
    );
  });
});
