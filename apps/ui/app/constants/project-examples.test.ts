// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { galleryProjects, sampleProjects } from '#constants/project-examples.js';

describe('galleryProjects', () => {
  it('should resolve every curated project through the generated thumbnail assets', () => {
    for (const project of galleryProjects) {
      expect(project.thumbnail).not.toBe('/placeholder.svg');
      expect(project.thumbnail).not.toBe('');
    }
  });

  it('exposes every manifest-backed Community project', () => {
    expect(galleryProjects.length).toBeGreaterThanOrEqual(34);
  });

  it('should expose every sample project without a placeholder filter', () => {
    expect(galleryProjects).toEqual(sampleProjects);
  });
});
