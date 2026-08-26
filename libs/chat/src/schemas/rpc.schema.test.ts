import { describe, expect, it } from 'vitest';
import { rpcClientErrorCode, rpcClientErrorCodeSchema, rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';

describe('rpcClientErrorCodeSchema', () => {
  it('should parse FILE_NOT_FOUND', () => {
    expect(rpcClientErrorCodeSchema.parse('FILE_NOT_FOUND')).toBe('FILE_NOT_FOUND');
  });

  it('should parse RENDER_TIMEOUT for runtime render-timeout failures', () => {
    expect(rpcClientErrorCodeSchema.parse('RENDER_TIMEOUT')).toBe('RENDER_TIMEOUT');
  });

  it('should parse VALIDATION_ERROR for handler-level input rejections', () => {
    expect(rpcClientErrorCodeSchema.parse('VALIDATION_ERROR')).toBe('VALIDATION_ERROR');
  });

  it('should parse RESULT_TOO_LARGE for directive overflow errors', () => {
    expect(rpcClientErrorCodeSchema.parse('RESULT_TOO_LARGE')).toBe('RESULT_TOO_LARGE');
  });

  it('should parse SKILL_NOT_FOUND for missing skill resolution failures', () => {
    expect(rpcClientErrorCodeSchema.parse('SKILL_NOT_FOUND')).toBe('SKILL_NOT_FOUND');
  });

  it('should still expose UNKNOWN as a generic catch-all', () => {
    expect(rpcClientErrorCodeSchema.parse('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('rpcClientErrorCode', () => {
  it('should enumerate every schema enum member exactly once', () => {
    const fromObject = new Set(Object.values(rpcClientErrorCode));
    expect(fromObject.size).toBe(rpcClientErrorCodeSchema.options.length);
    for (const code of rpcClientErrorCodeSchema.options) {
      expect(fromObject.has(code)).toBe(true);
    }
  });

  it('should expose the new validationError and resultTooLarge keys', () => {
    expect(rpcClientErrorCode.validationError).toBe('VALIDATION_ERROR');
    expect(rpcClientErrorCode.resultTooLarge).toBe('RESULT_TOO_LARGE');
    expect(rpcClientErrorCode.skillNotFound).toBe('SKILL_NOT_FOUND');
  });
});

describe('list_directory RPC schema', () => {
  const listDirectory = rpcSchemasRegistry[rpcName.listDirectory];

  it('should accept an omitted path so the handler can use the project root', () => {
    expect(listDirectory.inputSchema.safeParse({}).success).toBe(true);
  });
});

describe('grep RPC schema — additive envelope fields', () => {
  const grep = rpcSchemasRegistry[rpcName.grep];

  it('should accept the existing success shape extended with appliedHeadLimit + appliedOffset', () => {
    expect(
      grep.resultSchema.parse({
        success: true,
        matches: [],
        totalMatches: 0,
        truncated: false,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      }),
    ).toMatchObject({ success: true, appliedHeadLimit: 50, appliedOffset: 0 });
  });

  it('should reject a success payload missing appliedHeadLimit', () => {
    const parsed = grep.resultSchema.safeParse({
      success: true,
      matches: [],
      totalMatches: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it('should accept the new headLimit/offset input fields', () => {
    expect(grep.inputSchema.safeParse({ pattern: 'foo', headLimit: 50, offset: 0 }).success).toBe(true);
    expect(grep.inputSchema.safeParse({ pattern: 'foo' }).success).toBe(true);
  });

  it('should reject headLimit greater than 1000 at the schema layer', () => {
    expect(grep.inputSchema.safeParse({ pattern: 'foo', headLimit: 1001 }).success).toBe(false);
  });
});

describe('read_file RPC schema — metadata envelope fields', () => {
  const readFile = rpcSchemasRegistry[rpcName.readFile];

  it('should accept success payloads with required text metadata and optional truncated flag', () => {
    expect(
      readFile.resultSchema.parse({
        success: true,
        content: 'hi',
        size: 2,
        contentKind: 'text',
        totalLines: 1,
        startLine: 1,
        truncated: true,
      }),
    ).toMatchObject({ success: true, truncated: true });
  });

  it('should still accept success payloads that omit truncated', () => {
    expect(
      readFile.resultSchema.parse({
        success: true,
        content: 'hi',
        size: 2,
        contentKind: 'text',
        totalLines: 1,
        startLine: 1,
      }).success,
    ).toBe(true);
  });

  it('should reject limit greater than 2000 at the schema layer', () => {
    expect(readFile.inputSchema.safeParse({ targetFile: 'a.ts', limit: 2001 }).success).toBe(false);
  });

  it('should reject offset less than 1 at the schema layer', () => {
    expect(readFile.inputSchema.safeParse({ targetFile: 'a.ts', offset: 0 }).success).toBe(false);
  });
});

describe('capture_images RPC schema', () => {
  const captureImages = rpcSchemasRegistry[rpcName.captureImages];
  const canonicalViews = ['isometric', 'front', 'back', 'right', 'left', 'top', 'bottom', 'drawing'] as const;

  it('should accept every canonical screenshot view', () => {
    const parsed = captureImages.resultSchema.parse({
      success: true,
      images: canonicalViews.map((view) => ({ view, dataUrl: `data:image/webp;base64,${view}` })),
    });

    expect(parsed).toMatchObject({ success: true, images: canonicalViews.map((view) => ({ view })) });
  });

  it('should reject empty image sets, composite and unknown views, and unknown image keys', () => {
    expect(captureImages.resultSchema.safeParse({ success: true, images: [] }).success).toBe(false);
    for (const view of ['composite', 'current']) {
      expect(
        captureImages.resultSchema.safeParse({
          success: true,
          images: [{ view, dataUrl: 'data:image/webp;base64,AQ==' }],
        }).success,
      ).toBe(false);
    }
    expect(
      captureImages.resultSchema.safeParse({
        success: true,
        images: [{ view: 'front', dataUrl: 'data:image/webp;base64,AQ==', unexpected: true }],
      }).success,
    ).toBe(false);
  });
});

describe('resolve_skill RPC schema', () => {
  const resolveSkill = rpcSchemasRegistry[rpcName.resolveSkill];

  it('should accept a virtual system skill output without filesystem paths', () => {
    const parsed = resolveSkill.resultSchema.parse({
      success: true,
      skillName: 'create-skill',
      description: 'Create or update Tau agent skills',
      source: 'system',
      enabled: true,
      resourceUri: 'system:skills/create-skill/SKILL.md',
      fingerprint: 'systemhash',
      frontmatter: { name: 'create-skill' },
      content: '# Create Skill',
      supportingFiles: [],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.skillPath).toBeUndefined();
      expect(parsed.resourceUri).toBe('system:skills/create-skill/SKILL.md');
    }
  });

  it('should accept a filesystem skill output with supporting files and shadowed sources', () => {
    const parsed = resolveSkill.resultSchema.parse({
      success: true,
      skillName: 'woodworking',
      description: 'Woodworking help',
      source: 'user',
      enabled: true,
      resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
      skillPath: '.agents/skills/woodworking/SKILL.md',
      baseDirectory: '.agents/skills/woodworking',
      fingerprint: 'woodhash',
      frontmatter: { name: 'woodworking' },
      content: '# Woodworking',
      supportingFiles: ['.agents/skills/woodworking/references/table.md'],
      shadowedSources: [{ source: 'system', resourceUri: 'system:skills/woodworking/SKILL.md' }],
    });

    expect(parsed.success).toBe(true);
  });

  it('should accept a typed missing-skill error output', () => {
    const parsed = resolveSkill.resultSchema.parse({
      success: false,
      errorCode: rpcClientErrorCode.skillNotFound,
      message: 'Unknown skill: missing',
    });

    expect(parsed).toEqual({ success: false, errorCode: 'SKILL_NOT_FOUND', message: 'Unknown skill: missing' });
  });
});
