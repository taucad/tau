// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { builtinExamples } from '@taucad/tau-examples/builtin';
import { communityLocators, galleryProjects, sampleProjects } from '#constants/project-examples.js';

describe('galleryProjects', () => {
  it('should resolve every curated project through the generated thumbnail assets', () => {
    for (const project of galleryProjects) {
      expect(project.thumbnail).not.toBe('/placeholder.svg');
      expect(project.thumbnail).not.toBe('');
    }
  });

  it('should resolve every curated Community locator, in order, to a builtin with a thumbnail', () => {
    expect(galleryProjects.map(({ locator }) => locator)).toEqual(communityLocators);
  });

  it('should keep uncurated builtins out of the Community while leaving them loadable', () => {
    const builtinLocators = builtinExamples.map(({ locator }) => locator);
    expect(builtinLocators).toContain('jscad.cube');
    expect(sampleProjects.map(({ locator }) => locator)).toContain('jscad.cube');
    expect(galleryProjects.map(({ locator }) => locator)).not.toContain('jscad.cube');
  });
});
