import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const README = readFileSync(resolve(import.meta.dirname, 'README.md'), 'utf8');
const LINE_BUDGET = 220; // Origin: bounded persona-routed top page in opencascade.js.
const REQUIRED = [
  '## Install',
  '## Quick start',
  '## Compatibility',
  '## Versioning and stability',
  '## Security and provenance',
  '## Documentation',
  '## License',
] as const;

describe('README shape', () => {
  it('should stay within the persona-routed line budget', () => {
    expect(README.split('\n').length).toBeLessThanOrEqual(LINE_BUDGET);
  });

  it('should route readers before the first section', () => {
    const table = README.indexOf('| I want to…');
    const firstSection = README.search(/^## /mu);
    expect(table).toBeGreaterThanOrEqual(0);
    expect(table).toBeLessThan(firstSection);
  });

  it.each(REQUIRED)('should contain %s', (section) => {
    expect(README).toContain(section);
  });

  it('should contain a runnable public quick start and maintainer link', () => {
    expect(README).toContain("from '@@CREATE_REPO_npm-name@@'");
    expect(README).toContain('(MAINTAINER.md)');
  });
});
