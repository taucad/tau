import type { KernelProvider } from '@taucad/runtime';
import { kernelProviders } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';
import { getCadSystemPrompt } from '#prompts/cad-agent.prompt.js';
import type { ResolvedSection } from '#prompts/prompt-section-registry.js';

const allKernelProviders: readonly KernelProvider[] = kernelProviders;
const maxCoreTokens = 3000;
const maxStaticTokens = 4500;
const maxRenderedTokens = 4500;
const sectionMaxBytes = new Map([
  ['role', 1500],
  ['workflow', 3000],
  ['tool_usage_policy', 2000],
  ['constraints', 2000],
  ['output_efficiency', 800],
  ['tone', 800],
  ['visual_inspection', 3500],
  ['text_only_spatial_awareness', 1800],
  ['display_names', 1500],
  ['error_handling', 5000],
  ['system_rules', 1200],
  ['safety', 1800],
  ['geometry_fidelity', 3000],
  ['research_capabilities', 800],
  ['transcript_search', 1600],
  ['plan_mode', 1800],
  ['kernel_skill', 500],
  ['transcript_path', 500],
  ['environment', 600],
  ['dynamic_behavior', 1400],
]);
const migratedStaticSections = [
  'test_requirements',
  'code_standards',
  'topology_hints',
  'canonical_example',
  'multi_shape_pattern',
  'multi_file_pattern',
] as const;

const estimatedTokens = (value: string): number => value.length / 4;

const renderDefaultPrompt = (kernel: KernelProvider) =>
  getCadSystemPrompt(kernel, 'agent', true, {
    chatId: 'prompt-budget-test',
    modelId: 'prompt-budget-model',
    contextWindow: 200_000,
    knowledgeCutoff: '2026-01',
    supportsImageInput: true,
  });

const expectedSectionNames = (options: { mode: 'agent' | 'plan'; supportsImageInput: boolean }) => [
  'role',
  'workflow',
  'tool_usage_policy',
  'constraints',
  'output_efficiency',
  'tone',
  options.supportsImageInput ? 'visual_inspection' : 'text_only_spatial_awareness',
  'display_names',
  'error_handling',
  'system_rules',
  'safety',
  'geometry_fidelity',
  'research_capabilities',
  'transcript_search',
  ...(options.mode === 'plan' ? ['plan_mode'] : []),
  'kernel_skill',
  'transcript_path',
  'environment',
  'dynamic_behavior',
];

const promptBranches = [
  { mode: 'agent', testingEnabled: true, supportsImageInput: true },
  { mode: 'agent', testingEnabled: true, supportsImageInput: false },
  { mode: 'agent', testingEnabled: false, supportsImageInput: true },
  { mode: 'agent', testingEnabled: false, supportsImageInput: false },
  { mode: 'plan', testingEnabled: true, supportsImageInput: true },
  { mode: 'plan', testingEnabled: true, supportsImageInput: false },
  { mode: 'plan', testingEnabled: false, supportsImageInput: true },
  { mode: 'plan', testingEnabled: false, supportsImageInput: false },
] as const;

describe('getCadSystemPrompt progressive-disclosure contract', () => {
  it('should render byte-identical Block 1 content for every configured KernelProvider', () => {
    const prompts = allKernelProviders.map((kernel) => renderDefaultPrompt(kernel));
    const reference = prompts[0]?.static;

    expect(reference).toBeDefined();
    for (const prompt of prompts.slice(1)) {
      expect(prompt.static).toBe(reference);
    }
  });

  it('should keep the behavioral core within 3,000 estimated tokens', () => {
    const prompt = renderDefaultPrompt('openscad');
    expect(estimatedTokens(prompt.static)).toBeLessThanOrEqual(maxCoreTokens);
  });

  it('should keep total static content within 4,500 estimated tokens', () => {
    for (const kernel of allKernelProviders) {
      const prompt = renderDefaultPrompt(kernel);
      expect(estimatedTokens(prompt.static)).toBeLessThanOrEqual(maxStaticTokens);
    }
  });

  it.each(allKernelProviders)('should keep the rendered %s prompt within 4,500 estimated tokens', (kernel) => {
    const prompt = renderDefaultPrompt(kernel);
    expect(estimatedTokens(`${prompt.static}\n\n${prompt.dynamic}`)).toBeLessThanOrEqual(maxRenderedTokens);
  });

  it.each(promptBranches)(
    'should preserve the exact section contract for $mode/testing=$testingEnabled/images=$supportsImageInput',
    ({ mode, testingEnabled, supportsImageInput }) => {
      const sections: ResolvedSection[] = [];
      getCadSystemPrompt('replicad', mode, testingEnabled, {
        chatId: 'section-contract',
        modelId: 'section-contract-model',
        supportsImageInput,
        onSectionResolved: (section) => sections.push(section),
      });

      expect(sections.map(({ name }) => name)).toEqual(expectedSectionNames({ mode, supportsImageInput }));
      for (const section of sections) {
        const maxBytes = sectionMaxBytes.get(section.name);
        if (maxBytes === undefined) {
          throw new Error(`Missing byte ceiling for prompt section ${section.name}`);
        }
        expect(section.byteSize).toBeGreaterThan(0);
        expect(section.byteSize).toBeLessThanOrEqual(maxBytes);
      }
    },
  );

  it('should omit content migrated to kernel and GeoSpec skills from Block 1', () => {
    const sections: ResolvedSection[] = [];
    getCadSystemPrompt('replicad', 'agent', true, {
      onSectionResolved: (section) => sections.push(section),
    });

    const staticSectionNames = sections.filter(({ cacheBreak }) => !cacheBreak).map(({ name }) => name);
    for (const name of migratedStaticSections) {
      expect(staticSectionNames).not.toContain(name);
    }
  });

  it.each(promptBranches)(
    'should keep $mode/testing=$testingEnabled/images=$supportsImageInput structurally renderable',
    ({ mode, testingEnabled, supportsImageInput }) => {
      const prompt = getCadSystemPrompt('replicad', mode, testingEnabled, { supportsImageInput });
      expect(prompt.static.length).toBeGreaterThan(0);
      expect(prompt.dynamic.length).toBeGreaterThan(0);
    },
  );
});
