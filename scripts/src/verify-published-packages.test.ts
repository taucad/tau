import { describe, expect, it } from 'vitest';
import { installScriptsNotWarned, majorOf, releasedPins } from '#verify-published-packages.js';

describe('installScriptsNotWarned', () => {
  it('should accept an install whose install-scripts lines are all warnings', () => {
    const log = [
      'npm warn install-scripts 4 packages had install scripts blocked:',
      'npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)',
      'added 499 packages in 16s',
    ].join('\n');
    expect(installScriptsNotWarned(log)).toBeUndefined();
    expect(installScriptsNotWarned('added 499 packages in 16s\n')).toBeUndefined();
  });

  it('should name an install-scripts line that is an error', () => {
    const line = 'npm error install-scripts esbuild@0.28.2 is not covered by allowScripts';
    expect(installScriptsNotWarned(`npm warn deprecated x\n${line}\n`)).toBe(line);
  });
});

describe('majorOf', () => {
  it('should read the major version npm prints', () => {
    expect(majorOf('11.19.0\n')).toBe(11);
    expect(majorOf('12.2.0')).toBe(12);
    expect(majorOf('not a version')).toBeNaN();
  });
});

describe('releasedPins', () => {
  it('should keep the @taucad and geospec dependencies at their pinned versions', () => {
    expect(
      releasedPins({
        '@taucad/host': '0.1.0-beta.7',
        geospec: '0.1.0-beta.7',
        zod: '^4.1.0',
        'geospec-engine': '0.3.0',
      }),
    ).toEqual([
      ['@taucad/host', '0.1.0-beta.7'],
      ['geospec', '0.1.0-beta.7'],
    ]);
  });
});
