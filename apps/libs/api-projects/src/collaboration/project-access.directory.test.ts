import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '@taucad/api-database';
import { project, projectCollaborator, user } from '@taucad/api-database/schema';
import { ProjectAccessService } from '#collaboration/project-access.service.js';

/**
 * Q2: any member reads the project's member directory — account ids, names
 * and roles — and nothing in it is an email address, not even a display name
 * that happens to be one.
 */
describe('ProjectAccessService.directory (Q2)', () => {
  const projectId = 'proj_directoryfixture0';

  type Row = { accountId: string; name: string; role?: string };

  /** A database whose three directory reads answer the given rows, recording what the user lookup asked for. */
  const serviceOver = (rows: {
    owner: Row[];
    collaborators: Row[];
    accounts: Row[];
  }): { service: ProjectAccessService; userLookups: () => number } => {
    let lookups = 0;
    const select = vi.fn().mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === project) {
          return { innerJoin: () => ({ where: () => ({ limit: async () => rows.owner }) }) };
        }
        if (table === projectCollaborator) {
          return { innerJoin: () => ({ where: () => ({ orderBy: async () => rows.collaborators }) }) };
        }
        if (table === user) {
          return {
            where: async () => {
              lookups += 1;
              return rows.accounts;
            },
          };
        }
        throw new Error('unexpected table');
      },
    }));
    const service = new ProjectAccessService({ database: { select } } as unknown as DatabaseService);
    return { service, userLookups: () => lookups };
  };

  it('should list the owner first, then collaborators with their roles', async () => {
    const { service, userLookups } = serviceOver({
      owner: [{ accountId: 'user_owner', name: 'Olive' }],
      collaborators: [
        { accountId: 'user_writer', name: 'Wren', role: 'write' },
        { accountId: 'user_reader', name: 'Reed', role: 'read' },
      ],
      accounts: [],
    });

    await expect(service.directory(projectId, ['user_owner', 'user_writer'])).resolves.toStrictEqual([
      { accountId: 'user_owner', name: 'Olive', role: 'owner' },
      { accountId: 'user_writer', name: 'Wren', role: 'write' },
      { accountId: 'user_reader', name: 'Reed', role: 'read' },
    ]);
    /* Every named account is a member, so no further lookup runs. */
    expect(userLookups()).toBe(0);
  });

  it('should name a former member the caller asks about, without a role', async () => {
    const { service } = serviceOver({
      owner: [{ accountId: 'user_owner', name: 'Olive' }],
      collaborators: [],
      accounts: [{ accountId: 'user_former', name: 'Fern' }],
    });

    await expect(service.directory(projectId, ['user_former'])).resolves.toStrictEqual([
      { accountId: 'user_owner', name: 'Olive', role: 'owner' },
      { accountId: 'user_former', name: 'Fern' },
    ]);
  });

  it('should never return an email address, even as a display name', async () => {
    const { service } = serviceOver({
      owner: [{ accountId: 'user_owner', name: 'olive@example.com' }],
      collaborators: [{ accountId: 'user_writer', name: '  ', role: 'write' }],
      accounts: [{ accountId: 'user_former', name: 'fern@example.com' }],
    });

    const directory = await service.directory(projectId, ['user_former']);

    expect(directory).toStrictEqual([
      { accountId: 'user_owner', role: 'owner' },
      { accountId: 'user_writer', role: 'write' },
      { accountId: 'user_former' },
    ]);
    expect(JSON.stringify(directory)).not.toContain('@');
  });
});
