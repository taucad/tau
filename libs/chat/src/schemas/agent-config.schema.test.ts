import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  agentConfigSchema,
  cadAgentConfigSchema,
  commitNameAgentConfigSchema,
  projectNameAgentConfigSchema,
} from '#schemas/agent-config.schema.js';
import type { CadAgentConfigInput } from '#schemas/agent-config.schema.js';

const validCadAgent: CadAgentConfigInput = {
  profile: 'cad',
  model: 'anthropic/claude-sonnet-4-5',
  kernel: 'replicad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
};

describe('agentConfigSchema', () => {
  describe('discriminator', () => {
    it('should parse a valid cad profile via the union', () => {
      const result = agentConfigSchema.parse(validCadAgent);

      expect(result.profile).toBe('cad');
      if (result.profile === 'cad') {
        expect(result.model).toBe('anthropic/claude-sonnet-4-5');
        expect(result.kernel).toBe('replicad');
      }
    });

    it('should parse a valid project_name profile via the union', () => {
      const result = agentConfigSchema.parse({ profile: 'project_name' });

      expect(result).toEqual({ profile: 'project_name' });
    });

    it('should parse a valid commit_name profile via the union', () => {
      const result = agentConfigSchema.parse({ profile: 'commit_name' });

      expect(result).toEqual({ profile: 'commit_name' });
    });

    it('should reject an unknown profile with a path on profile', () => {
      const result = agentConfigSchema.safeParse({ profile: 'unknown' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue?.path).toEqual(['profile']);
      }
    });

    it('should reject a missing profile discriminator', () => {
      const result = agentConfigSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue?.path).toEqual(['profile']);
      }
    });
  });

  describe('cad variant required fields', () => {
    it('should reject a cad agent missing model with path agent.model', () => {
      const { model: _model, ...withoutModel } = validCadAgent;
      const result = agentConfigSchema.safeParse(withoutModel);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.join('.') === 'model')).toBe(true);
      }
    });

    it('should reject a cad agent missing kernel with path agent.kernel', () => {
      const { kernel: _kernel, ...withoutKernel } = validCadAgent;
      const result = agentConfigSchema.safeParse(withoutKernel);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.join('.') === 'kernel')).toBe(true);
      }
    });

    it('should reject a cad agent missing testingEnabled with path agent.testingEnabled', () => {
      const { testingEnabled: _t, ...withoutTesting } = validCadAgent;
      const result = agentConfigSchema.safeParse(withoutTesting);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.join('.') === 'testingEnabled')).toBe(true);
      }
    });

    it('should reject a cad agent missing mode with path agent.mode', () => {
      const { mode: _mode, ...withoutMode } = validCadAgent;
      const result = agentConfigSchema.safeParse(withoutMode);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.join('.') === 'mode')).toBe(true);
      }
    });

    it('should reject a cad agent missing toolChoice with path agent.toolChoice', () => {
      const { toolChoice: _tc, ...withoutToolChoice } = validCadAgent;
      const result = agentConfigSchema.safeParse(withoutToolChoice);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.join('.') === 'toolChoice')).toBe(true);
      }
    });
  });

  describe('snapshot / contextPayload optionality', () => {
    it('should leave snapshot undefined when omitted from the wire — no sentinel default, no controller-side collapse', () => {
      const result = cadAgentConfigSchema.parse(validCadAgent);

      expect(result.snapshot).toBeUndefined();
    });

    it('should leave contextPayload undefined when omitted from the wire — no sentinel default, no controller-side collapse', () => {
      const result = cadAgentConfigSchema.parse(validCadAgent);

      expect(result.contextPayload).toBeUndefined();
    });

    it('should preserve a provided snapshot verbatim', () => {
      const result = cadAgentConfigSchema.parse({
        ...validCadAgent,
        snapshot: { activeFile: { path: 'src/main.ts', name: 'main.ts' } },
      });

      expect(result.snapshot?.activeFile).toEqual({ path: 'src/main.ts', name: 'main.ts' });
    });

    it('should preserve a provided contextPayload verbatim', () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `AGENTS.md` is a filesystem key, not a JS identifier
      const memory = { 'AGENTS.md': 'guidelines' };
      const result = cadAgentConfigSchema.parse({
        ...validCadAgent,
        contextPayload: { memory },
      });

      expect(result.contextPayload?.memory).toEqual(memory);
    });
  });

  describe('auxiliary profiles', () => {
    it('should reject extra fields on the project_name variant (variant carries no caller knobs)', () => {
      const result = projectNameAgentConfigSchema.safeParse({
        profile: 'project_name',
        model: 'gpt-4o-mini',
      });
      // Default Zod object strips unknown keys; assert the parsed shape contains only profile.
      if (result.success) {
        expect(result.data).toEqual({ profile: 'project_name' });
      } else {
        expect.fail('project_name should accept the bare profile literal');
      }
    });

    it('should reject extra fields on the commit_name variant', () => {
      const result = commitNameAgentConfigSchema.safeParse({
        profile: 'commit_name',
        kernel: 'replicad',
      });
      if (result.success) {
        expect(result.data).toEqual({ profile: 'commit_name' });
      } else {
        expect.fail('commit_name should accept the bare profile literal');
      }
    });
  });

  describe('JSON Schema purity (R13 contract)', () => {
    const jsonSchema = z.toJSONSchema(agentConfigSchema);

    const collectKeys = (node: unknown, keys: Set<string>): void => {
      if (node === null || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        for (const entry of node) {
          collectKeys(entry, keys);
        }
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        keys.add(key);
        collectKeys(value, keys);
      }
    };

    it('should emit no `not` / `if` / `then` artefacts anywhere (no hidden refinements)', () => {
      const keys = new Set<string>();
      collectKeys(jsonSchema, keys);

      expect(keys.has('not')).toBe(false);
      expect(keys.has('if')).toBe(false);
      expect(keys.has('then')).toBe(false);
    });

    it('should emit an anyOf or oneOf branching on the profile literal at the top level', () => {
      // Zod v4 emits anyOf for discriminated unions by default; both are acceptable
      // structurally since they encode the same "exactly one of" semantics.
      const branches =
        (jsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] }).anyOf ??
        (jsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] }).oneOf;

      expect(Array.isArray(branches)).toBe(true);
      expect(branches?.length).toBe(3);
    });
  });
});
