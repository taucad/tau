import { describe, expect, it } from 'vitest';
import {
  parseProjectOpenFixtureOptions,
  projectOpenTargetEntryPath,
  projectOpenTargetFiles,
  projectOpenTargetManifest,
} from '#routes/[__e2e].project-navigation/project-open-fixture.js';

describe('project-open fixture', () => {
  it.each([1, 20, 64, 500] as const)('should admit the %i-project catalog', (totalProjects) => {
    expect(parseProjectOpenFixtureOptions(new URLSearchParams(`projects=${String(totalProjects)}&files=10`))).toEqual({
      totalProjects,
      targetFileCount: 10,
      layout: 'shallow',
    });
  });

  it.each(['0', '2', '501', '20x'])('should reject an unsupported catalog size %s', (totalProjects) => {
    expect(() => parseProjectOpenFixtureOptions(new URLSearchParams(`projects=${totalProjects}&files=10`))).toThrow(
      'projects must be 1, 20, 64, or 500',
    );
  });

  it.each([10, 1000, 10_000] as const)('should seed exactly %i authored files at both layouts', (targetFileCount) => {
    const shallow = projectOpenTargetFiles({ targetFileCount, layout: 'shallow' });
    const deep = projectOpenTargetFiles({ targetFileCount, layout: 'deep' });
    expect(Object.keys(shallow)).toHaveLength(targetFileCount);
    expect(Object.keys(shallow).filter((path) => path.includes('/'))).toEqual([]);
    expect(Object.keys(deep)).toHaveLength(targetFileCount);
    expect(shallow[projectOpenTargetEntryPath]?.content).toEqual(deep[projectOpenTargetEntryPath]?.content);
    expect(projectOpenTargetManifest().assets.main.entryPath).toBe(projectOpenTargetEntryPath);
    expect(Object.keys(deep).filter((path) => path.startsWith('parts/group-'))).toHaveLength(targetFileCount - 1);
  });

  it('should reject unsupported file counts and layouts', () => {
    expect(() => parseProjectOpenFixtureOptions(new URLSearchParams('projects=1&files=9'))).toThrow(
      'files must be 10, 1000, or 10000',
    );
    expect(() => parseProjectOpenFixtureOptions(new URLSearchParams('projects=1&files=10&layout=other'))).toThrow(
      'layout must be shallow or deep',
    );
  });
});
