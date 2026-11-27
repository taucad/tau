import { describe, expect, it } from 'vitest';

import {
  parseSkillFrontmatter,
  readSkillFrontmatter,
  skillFrontmatterFields,
  validateSkillFrontmatter,
} from '#skills/skill-metadata.js';
import { tauStoreSkills } from '#skills/store-catalog.js';

const skillFile = (frontmatter: string): string => `---\n${frontmatter}\n---\n\n# Body\n`;

describe('readSkillFrontmatter', () => {
  it('should read the frontmatter as YAML, block scalars and nested metadata included', () => {
    const frontmatter = readSkillFrontmatter(
      skillFile(
        [
          'name: pdf-processing',
          'description: >-',
          '  Extract PDF text and fill forms.',
          '  Use when handling PDFs.',
          'license: Apache-2.0',
          'metadata:',
          '  author: example-org',
          '  version: "1.0"',
        ].join('\n'),
      ),
    );

    expect(frontmatter).toEqual({
      name: 'pdf-processing',
      description: 'Extract PDF text and fill forms. Use when handling PDFs.',
      license: 'Apache-2.0',
      metadata: { author: 'example-org', version: '1.0' },
    });
  });

  it('should read a description whose unquoted value holds a colon, as skills written for other clients do', () => {
    const frontmatter = readSkillFrontmatter(
      skillFile('name: pdf\ndescription: Use this skill when: the user asks about PDFs'),
    );

    expect(frontmatter).toEqual({ name: 'pdf', description: 'Use this skill when: the user asks about PDFs' });
  });

  it.each([
    ['no frontmatter', '# Just a heading\n'],
    ['an unterminated block', '---\nname: x\ndescription: y\n'],
    ['YAML that cannot be parsed', skillFile('name: [unclosed\ndescription: y')],
    ['a frontmatter that is not a mapping', skillFile('- name\n- description')],
  ])('should give nothing for %s', (_case, content) => {
    expect(readSkillFrontmatter(content)).toBeUndefined();
  });
});

describe('validateSkillFrontmatter', () => {
  it('should accept the specification’s own example as written', () => {
    const frontmatter = readSkillFrontmatter(
      skillFile(
        'name: pdf-processing\ndescription: Extract PDF text, fill forms, merge files. Use when handling PDFs.\nlicense: Apache-2.0\nmetadata:\n  author: example-org\n  version: "1.0"',
      ),
    );

    expect(validateSkillFrontmatter(frontmatter!, 'pdf-processing')).toEqual([]);
  });

  it.each(['PDF-Processing', '-pdf', 'pdf-', 'pdf--processing', 'pdf_processing', 'pdf processing'])(
    'should report the name %s, which the specification does not allow',
    (name) => {
      expect(validateSkillFrontmatter({ name, description: 'd' }, name)).toEqual([
        'name may hold only lowercase letters, digits and single hyphens, and may not start or end with a hyphen.',
      ]);
    },
  );

  it('should report each limit the specification sets, and a name that is not its directory', () => {
    const diagnostics = validateSkillFrontmatter(
      { name: 'a'.repeat(65), description: 'd'.repeat(1025), compatibility: 'c'.repeat(501) },
      'elsewhere',
    );

    expect(diagnostics).toEqual([
      'name is 65 characters; the limit is 64.',
      `name "${'a'.repeat(65)}" does not match its directory "elsewhere".`,
      'description is 1025 characters; the limit is 1024.',
      'compatibility is 501 characters; the limit is 500.',
    ]);
  });

  it('should report a top-level field the specification does not define, and metadata that is not strings', () => {
    expect(
      validateSkillFrontmatter({ name: 'x', description: 'd', version: '1.0.0', metadata: { enabled: true } }, 'x'),
    ).toEqual([
      'metadata must map string keys to string values.',
      '"version" is not a field of the Agent Skills specification; put client data under metadata.',
    ]);
  });

  it('should name exactly the six fields of the specification', () => {
    expect(skillFrontmatterFields).toEqual([
      'name',
      'description',
      'license',
      'compatibility',
      'metadata',
      'allowed-tools',
    ]);
  });
});

describe('parseSkillFrontmatter', () => {
  it('should load a skill that departs from the specification and say how', () => {
    const skill = parseSkillFrontmatter(
      skillFile('name: Other-Name\ndescription: Works anyway'),
      '.agents/skills/my-skill/SKILL.md',
    );

    expect(skill).toEqual(expect.objectContaining({ name: 'Other-Name', description: 'Works anyway', enabled: true }));
    expect(skill?.diagnostics).toEqual([
      'name may hold only lowercase letters, digits and single hyphens, and may not start or end with a hyphen.',
      'name "Other-Name" does not match its directory "my-skill".',
    ]);
  });

  it.each([
    ['a missing description', 'name: incomplete'],
    ['an empty description', 'name: incomplete\ndescription: ""'],
    ['a missing name', 'description: No name'],
  ])('should skip a skill with %s', (_case, frontmatter) => {
    expect(parseSkillFrontmatter(skillFile(frontmatter), '.agents/skills/incomplete/SKILL.md')).toBeUndefined();
  });

  it('should not read Tau keys from the top level, where the specification has no such fields', () => {
    const skill = parseSkillFrontmatter(
      skillFile(
        'name: old-shape\ndescription: Written before the move\nsource: tau-store\nversion: 2.0.0\nenabled: false',
      ),
      '.agents/skills/old-shape/SKILL.md',
      { source: 'user' },
    );

    expect(skill).toEqual(expect.objectContaining({ source: 'user', version: undefined, enabled: true }));
    expect(skill?.diagnostics).toHaveLength(3);
  });

  it('should take source, version and enabled from metadata', () => {
    const skill = parseSkillFrontmatter(
      skillFile(
        'name: catalog\ndescription: Has catalog fields\nmetadata:\n  source: tau-store\n  version: "2.1.0"\n  enabled: "false"',
      ),
      '.agents/skills/catalog/SKILL.md',
      { source: 'user' },
    );

    expect(skill).toEqual(expect.objectContaining({ source: 'tau-store', version: '2.1.0', enabled: false }));
    expect(skill?.diagnostics).toBeUndefined();
  });
});

describe('tauStoreSkills', () => {
  it.each(tauStoreSkills.map((skill) => [skill.slug, skill] as const))(
    'should ship %s with frontmatter the Agent Skills specification accepts as written',
    (slug, skill) => {
      const frontmatter = readSkillFrontmatter(skill.skillMarkdown);

      expect(frontmatter).toBeDefined();
      expect(validateSkillFrontmatter(frontmatter!, slug)).toEqual([]);
      expect(frontmatter).toEqual({
        name: slug,
        description: `${skill.description}. ${skill.whenToUse}`,
        metadata: { source: 'tau-store', version: skill.version },
      });
    },
  );
});
