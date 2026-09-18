import { describe, it, expect } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';

describe('repositoryLocator', () => {
  it('should carry the tenant and the project through unchanged', () => {
    expect(repositoryLocator({ ownerId: 'user_abc', projectId: 'proj_xyz' })).toStrictEqual({
      ownerId: 'user_abc',
      projectId: 'proj_xyz',
    });
  });

  it('should keep an explicit storage account id', () => {
    expect(repositoryLocator({ ownerId: 'user_abc', projectId: 'proj_xyz', accountId: 'tau-default' })).toStrictEqual({
      ownerId: 'user_abc',
      projectId: 'proj_xyz',
      accountId: 'tau-default',
    });
  });

  it('should omit the account id when it is absent rather than writing undefined', () => {
    expect(Object.hasOwn(repositoryLocator({ ownerId: 'user_abc', projectId: 'proj_xyz' }), 'accountId')).toBe(false);
  });

  it.each([
    ['an empty owner', { ownerId: '', projectId: 'proj_xyz' }],
    ['an empty project', { ownerId: 'user_abc', projectId: '' }],
    ['a traversing project', { ownerId: 'user_abc', projectId: '../other' }],
    ['a traversing owner', { ownerId: '../other', projectId: 'proj_xyz' }],
    ['a project holding a separator', { ownerId: 'user_abc', projectId: 'proj/xyz' }],
    ['an owner holding a separator', { ownerId: 'user/abc', projectId: 'proj_xyz' }],
    ['an owner that is too long', { ownerId: `u${'x'.repeat(64)}`, projectId: 'proj_xyz' }],
  ])('should refuse %s so no key can cross a tenant boundary', (_name, args) => {
    expect(() => {
      repositoryLocator(args);
    }).toThrow(/not a storable identifier/u);
  });
});
