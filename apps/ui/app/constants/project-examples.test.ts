// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { builtinExamples } from '@taucad/tau-examples/builtin';
import {
  communityLocators,
  featuredCommunityLocator,
  galleryProjects,
  sampleProjects,
} from '#constants/project-examples.js';

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

  it('should lead the Community with the featured example, so it opens the unfiltered first page', () => {
    expect(galleryProjects[0]?.locator).toBe(featuredCommunityLocator);
  });

  it('should show the first ten curated examples on both landing variants', () => {
    // Both landings render `galleryProjects` with `limit={10}`; a new builtin must not displace these.
    expect(galleryProjects.slice(0, 10).map(({ locator }) => locator)).toEqual([
      'replicad.kestrel-240-quadcopter',
      'replicad.v8-engine',
      'replicad.bench-vise',
      'replicad.turbofan',
      'openscad.arq5-racing-quadcopter',
      'replicad.six-axis-arm',
      'replicad.heat-exchanger',
      'replicad.worm-gear-system',
      'replicad.standing-fan',
      'replicad.spur-gearbox',
    ]);
  });
});
