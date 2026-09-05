import { describe, it, expect } from 'vitest';
import {
  contextPayloadSchema,
  skillMetadataSchema,
  contextMemoryMaxBytes,
  contextSkillsMaxEntries,
} from '#schemas/context-payload.schema.js';

describe('skillMetadataSchema', () => {
  it('should accept a valid skill entry', () => {
    const result = skillMetadataSchema.safeParse({
      name: 'my-skill',
      description: 'Does useful things',
      resourceUri: 'file:.agents/skills/my-skill/SKILL.md',
      path: '.agents/skills/my-skill',
      skillPath: '.agents/skills/my-skill/SKILL.md',
      source: 'user',
      version: '1.0.0',
      whenToUse: 'Use for useful things',
      fingerprint: 'abc123',
      enabled: true,
      shadowedSources: [{ source: 'legacy', path: '.tau/skills/my-skill', fingerprint: 'def456' }],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'my-skill',
      description: 'Does useful things',
      resourceUri: 'file:.agents/skills/my-skill/SKILL.md',
      path: '.agents/skills/my-skill',
      skillPath: '.agents/skills/my-skill/SKILL.md',
      source: 'user',
      version: '1.0.0',
      whenToUse: 'Use for useful things',
      fingerprint: 'abc123',
      enabled: true,
      shadowedSources: [{ source: 'legacy', path: '.tau/skills/my-skill', fingerprint: 'def456' }],
    });
  });

  it('should accept legacy fallback path with optional source', () => {
    const result = skillMetadataSchema.safeParse({
      name: 'sourced',
      description: 'Has a source',
      path: '.tau/skills/sourced',
      source: 'project',
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('project');
  });

  it('should reject skill entry missing name', () => {
    const result = skillMetadataSchema.safeParse({
      description: 'No name field',
      path: '.tau/skills/x',
    });

    expect(result.success).toBe(false);
  });

  it('should reject skill entry missing description', () => {
    const result = skillMetadataSchema.safeParse({
      name: 'incomplete',
      path: '.tau/skills/incomplete',
    });

    expect(result.success).toBe(false);
  });

  it('should accept virtual system skill entries without a filesystem path', () => {
    const result = skillMetadataSchema.safeParse({
      name: 'create-skill',
      description: 'Create or update Tau agent skills',
      resourceUri: 'system:skills/create-skill/SKILL.md',
      source: 'system',
    });

    expect(result.success).toBe(true);
    expect(result.data?.path).toBeUndefined();
  });
});

describe('contextPayloadSchema', () => {
  it('should accept valid context payload with skills and memory', () => {
    const agentsKey = '.tau/AGENTS.md';
    const result = contextPayloadSchema.safeParse({
      skills: [
        { name: 'skill-a', description: 'First skill', path: '.agents/skills/skill-a' },
        { name: 'skill-b', description: 'Second skill', resourceUri: 'system:skills/skill-b/SKILL.md' },
      ],
      memory: { [agentsKey]: '# Rules\n\nUse early returns.' },
    });

    expect(result.success).toBe(true);
    expect(result.data?.skills).toHaveLength(2);
    expect(result.data?.memory?.[agentsKey]).toContain('early returns');
  });

  it('should accept payload with only skills', () => {
    const result = contextPayloadSchema.safeParse({
      skills: [{ name: 'solo', description: 'Only skill', path: '.agents/skills/solo' }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.skills).toHaveLength(1);
    expect(result.data?.memory).toBeUndefined();
  });

  it('should accept payload with only memory', () => {
    const agentsKey = '.tau/AGENTS.md';
    const result = contextPayloadSchema.safeParse({
      memory: { [agentsKey]: 'Memory content' },
    });

    expect(result.success).toBe(true);
    expect(result.data?.skills).toBeUndefined();
    expect(result.data?.memory?.[agentsKey]).toBe('Memory content');
  });

  it('should accept empty payload', () => {
    const result = contextPayloadSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data?.skills).toBeUndefined();
    expect(result.data?.memory).toBeUndefined();
  });

  it('should accept payload with empty skills array', () => {
    const result = contextPayloadSchema.safeParse({ skills: [] });

    expect(result.success).toBe(true);
    expect(result.data?.skills).toEqual([]);
  });

  it('should reject payload with invalid skill entry in array', () => {
    const result = contextPayloadSchema.safeParse({
      skills: [{ name: 'valid', description: 'ok', path: 'p' }, { description: 'missing name' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('CH-10 payload caps', () => {
  it('rejects a memory entry beyond the byte ceiling', () => {
    const oversized = 'x'.repeat(contextMemoryMaxBytes + 512);
    const result = contextPayloadSchema.safeParse({ memory: { '.tau/AGENTS.md': oversized } });
    expect(result.success).toBe(false);
  });

  it('accepts a memory entry at the truncated size including the notice', () => {
    const truncated = 'x'.repeat(contextMemoryMaxBytes) + '\n[AGENTS.md truncated]';
    const result = contextPayloadSchema.safeParse({ memory: { '.tau/AGENTS.md': truncated } });
    expect(result.success).toBe(true);
  });

  it('rejects a skills catalog beyond the entry cap', () => {
    const skills = Array.from({ length: contextSkillsMaxEntries + 1 }, (_, index) => ({
      name: `skill-${String(index)}`,
      description: 'x',
    }));
    const result = contextPayloadSchema.safeParse({ skills });
    expect(result.success).toBe(false);
  });
});
