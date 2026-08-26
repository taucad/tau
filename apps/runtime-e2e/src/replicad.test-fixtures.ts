/**
 * Test fixtures for replicad kernel integration tests.
 * Loads curated examples from @taucad/tau-examples covering a wide range of replicad API surface area.
 */

import type { Fixture } from '@taucad/tau-examples/fixtures';
import { loadFixture } from '@taucad/tau-examples/fixtures';

/** A named example fixture for parameterized testing. */
export type ExampleFixture = Fixture & { name: string };

/** All example fixtures for parameterized testing. */
export const exampleFixtures: ExampleFixture[] = [
  { name: 'tray', ...loadFixture('replicad', 'tray') },
  { name: 'birdhouse', ...loadFixture('replicad', 'birdhouse') },
  { name: 'bottle', ...loadFixture('replicad', 'bottle') },
  { name: 'gridfinity-box', ...loadFixture('replicad', 'gridfinity-box') },
  { name: 'vase', ...loadFixture('replicad', 'vase') },
  { name: 'wavy-vase', ...loadFixture('replicad', 'wavy-vase') },
  { name: 'cycloidal-gear', ...loadFixture('replicad', 'cycloidal-gear') },
  { name: 'projection-test', ...loadFixture('replicad', 'projection-test') },
];
