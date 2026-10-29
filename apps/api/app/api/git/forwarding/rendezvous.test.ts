import { describe, expect, it } from 'vitest';
import { rendezvousRank } from '#api/git/forwarding/rendezvous.js';

/** DC2: the ranking every API Machine computes alone, over the deployed tau-storage members. */
describe('rendezvousRank (DC2)', () => {
  const members = ['e2865123a62986', '1781973f003d89', '9080e6f3a01e28', '3d8d9e1b7c4e18'];
  const projects = Array.from({ length: 400 }, (_, index) => `proj-${String(index)}`);

  it('should rank the same members the same way whatever order they are listed in', () => {
    for (const project of projects.slice(0, 20)) {
      expect(rendezvousRank(project, members.toReversed())).toEqual(rendezvousRank(project, members));
    }
    expect(rendezvousRank('proj-1', [...members, members[0]!])).toHaveLength(members.length);
  });

  it('should move only the removed member’s projects, each to its own second, when one member goes', () => {
    const removed = members[1]!;
    const remaining = members.filter((member) => member !== removed);
    for (const project of projects) {
      const before = rendezvousRank(project, members);
      const after = rendezvousRank(project, remaining);
      expect(after).toEqual(before.filter((member) => member !== removed));
    }
  });

  it('should spread projects over every member', () => {
    const first = new Map<string, number>();
    for (const project of projects) {
      const preferred = rendezvousRank(project, members)[0]!;
      first.set(preferred, (first.get(preferred) ?? 0) + 1);
    }
    expect(first.size).toBe(members.length);
    for (const count of first.values()) {
      expect(count).toBeGreaterThan(projects.length / members.length / 2);
    }
  });
});
