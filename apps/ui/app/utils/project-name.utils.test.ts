import { describe, expect, it } from 'vitest';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';
import { fitProjectName, maxProjectNameLength, projectNameFromReply } from '#utils/project-name.utils.js';

const manifestWithName = (name: string): unknown => ({
  $schema: projectManifestSchemaUrl,
  name,
  description: '',
  tags: [],
  assets: {},
});

describe('fitProjectName', () => {
  it('should keep the limit the manifest schema enforces', () => {
    expect(projectManifestSchema.safeParse(manifestWithName('a'.repeat(maxProjectNameLength))).success).toBe(true);
    expect(projectManifestSchema.safeParse(manifestWithName('a'.repeat(maxProjectNameLength + 1))).success).toBe(false);
  });

  it('should collapse whitespace and line breaks into single spaces', () => {
    expect(fitProjectName('  Gear\n\tHousing   Cover  ')).toBe('Gear Housing Cover');
  });

  it('should cut a long name to the limit without splitting a code point', () => {
    const fitted = fitProjectName(`${'a'.repeat(maxProjectNameLength - 1)}🦊tail`);

    expect(fitted).toBe('a'.repeat(maxProjectNameLength - 1));
    expect(projectManifestSchema.safeParse(manifestWithName(fitted)).success).toBe(true);
  });

  it('should leave room for a suffix', () => {
    expect(fitProjectName('a'.repeat(maxProjectNameLength), 10)).toBe('a'.repeat(10));
  });

  it('should drop the trailing space a cut leaves', () => {
    expect(fitProjectName(`${'a'.repeat(maxProjectNameLength - 1)} bc`)).toBe('a'.repeat(maxProjectNameLength - 1));
  });
});

describe('projectNameFromReply', () => {
  it('should take the first title when the model answered one line per image', () => {
    // The reply staging stored for 8 images and a prompt asking for one short line each (226 code units).
    const reply = [
      ...Array.from({ length: 6 }, () => 'Red Square With TAU 42 Horizontal'),
      'Red Square With TAU 42',
    ].join('\n');

    expect(reply.length).toBeGreaterThan(maxProjectNameLength);
    expect(projectNameFromReply(reply)).toBe('Red Square With TAU 42 Horizontal');
  });

  it('should skip leading blank lines and unwrap quotes and emphasis', () => {
    expect(projectNameFromReply('\n\n  **"Planetary Gearbox"**  \nmore')).toBe('Planetary Gearbox');
  });

  it('should fit a single overlong line to the manifest', () => {
    const name = projectNameFromReply('word '.repeat(100));

    expect(name.length).toBeLessThanOrEqual(maxProjectNameLength);
    expect(projectManifestSchema.safeParse(manifestWithName(name)).success).toBe(true);
  });

  it('should return empty for a reply with no title', () => {
    expect(projectNameFromReply(' \n \n')).toBe('');
  });
});
