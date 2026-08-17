import type { KernelProvider } from '@taucad/runtime';
import { toolName } from '@taucad/chat/constants';
import { describe, it, expect, vi } from 'vitest';
import { getCadSystemPrompt } from '#api/chat/prompts/cad-agent.prompt.js';
import { getKernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';

const allKernelProviders: readonly KernelProvider[] = [
  'openrscad',
  'replicad',
  'jscad',
  'manifold',
  'opencascadejs',
  'zoo',
];

const bannedSimplificationGuidancePatterns = [
  /try a simpler model/i,
  /simplify the model/i,
  /compare simpler mesh evidence/i,
  /too complex to verify/i,
] as const;

const extractSection = (prompt: string, name: string): string => {
  const startTag = `<${name}>`;
  const endTag = `</${name}>`;
  const start = prompt.indexOf(startTag);
  const end = prompt.indexOf(endTag);
  if (start === -1 || end === -1) {
    throw new Error(`Missing <${name}> section`);
  }
  return prompt.slice(start, end + endTag.length);
};

const countOccurrences = (text: string, needle: string): number => text.split(needle).length - 1;

describe('getCadSystemPrompt', () => {
  // ===================================================================
  // Anti-gold-plating rules
  // ===================================================================

  describe('anti-gold-plating constraints', () => {
    it('should include a <constraints> section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<constraints>');
      expect(result.static).toContain('</constraints>');
    });

    it('should scope anti-gold-plating to code, not geometry', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<constraints>'),
        result.static.indexOf('</constraints>'),
      );
      expect(block).toMatch(/anti-gold-plating applies to code, not to geometry/i);
      expect(block).toMatch(/do not add unrelated code features/i);
      expect(block).toMatch(/implicit ask for a cad deliverable/i);
      expect(block).toMatch(/modelling a real fastener, fillet, or sub-component is the task/i);
    });

    it('should forbid unnecessary code-level error handling', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/do not add code-level error handling.*cannot happen/i);
    });

    it('should forbid premature abstractions', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/do not create helpers.*one-time/i);
    });
  });

  // ===================================================================
  // Production-grade role / quality bar
  //   Closes deferred R11/F9 from docs/research/system-prompt-audit.md
  //   and Finding 6 of docs/research/complex-task-agent-gap-analysis.md
  //   ("Anti-Gold-Plating Rules Conflict with Engineering Detail").
  // ===================================================================

  describe('production-grade <role>', () => {
    const extractRole = (prompt: string) => prompt.slice(prompt.indexOf('<role>'), prompt.indexOf('</role>'));

    it('should name the target audience (architects / engineers / product designers / manufacturing)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractRole(result.static);
      expect(block).toMatch(/architects/i);
      expect(block).toMatch(/engineers/i);
      expect(block).toMatch(/product designers/i);
      expect(block).toMatch(/manufacturing/i);
    });

    it('should set a production-grade quality bar and reject toy/hobbyist defaults', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractRole(result.static);
      expect(block).toMatch(/production-grade/i);
      expect(block).toMatch(/not a hobbyist sketch/i);
      expect(block).toMatch(/real engineering deliverable/i);
      expect(block).toMatch(/dimensionally faithful/i);
      expect(block).toMatch(/manufacturable as-is/i);
    });

    it('should instruct the agent to model visible engineering features rather than picking the simplest path', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractRole(result.static);
      expect(block).toMatch(/visible feature would exist on the real part/i);
      expect(block).toMatch(/simplest path that compiles/i);
      expect(block).toMatch(/omit detail "for simplicity"/i);
    });

    it('should NOT contain the old terse "CAD expert ... Create parametric 3D models for manufacturing" wording', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractRole(result.static);
      expect(block).not.toMatch(/Create parametric 3D models for manufacturing\./);
    });

    it('should keep the LaTeX formatting instruction', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractRole(result.static);
      expect(block).toMatch(/LaTeX/);
      expect(block).toContain('$...$');
      expect(block).toContain('$$...$$');
    });
  });

  // ===================================================================
  // Rationalization inoculation
  // ===================================================================

  describe('rationalization inoculation in visual inspection', () => {
    it('should enumerate avoidance patterns in <visual_inspection>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('approximately right');
      expect(result.static).toContain("hasn't complained");
      expect(result.static).toContain('Verification is incomplete');
      expect(result.static).not.toContain('too complex to verify');
      expect(result.static).toContain('Tests are passing');
    });

    it('should instruct to call screenshot if about to write explanation', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/catch yourself writing an explanation.*call screenshot/i);
    });

    it('should not include model-simplification failure guidance in any kernel prompt', async () => {
      for (const kernel of allKernelProviders) {
        // oxlint-disable-next-line no-await-in-loop -- intentional sequential loop
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const corpus = `${result.static}\n${result.dynamic}`;
        for (const pattern of bannedSimplificationGuidancePatterns) {
          expect(corpus).not.toMatch(pattern);
        }
      }
    });
  });

  describe('text-only spatial awareness', () => {
    it('should replace screenshot inspection guidance with GeoSpec-focused spatial feedback', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        supportsImageInput: false,
      });

      expect(result.static).toContain('<text_only_spatial_awareness>');
      expect(result.static).toContain('This model cannot receive images');
      expect(result.static).toContain('Use GeoSpec as the spatial feedback channel');
      expect(result.static).toContain('Do not claim visual inspection');
      expect(result.static).not.toContain('<visual_inspection>');
      expect(result.static).not.toContain(`\`${toolName.screenshot}\``);
    });

    it('should keep visual inspection guidance for image-capable models', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        supportsImageInput: true,
      });

      expect(result.static).toContain('<visual_inspection>');
      expect(result.static).toContain(`\`${toolName.screenshot}\``);
      expect(result.static).not.toContain('<text_only_spatial_awareness>');
    });
  });

  // ===================================================================
  // Static/dynamic split
  // ===================================================================

  describe('static/dynamic prompt split', () => {
    it('should return an object with static and dynamic properties', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result).toHaveProperty('static');
      expect(result).toHaveProperty('dynamic');
      expect(typeof result.static).toBe('string');
      expect(typeof result.dynamic).toBe('string');
    });

    it('should place <role> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<role>');
    });

    it('should place <workflow> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<workflow>');
    });

    it('should place <code_standards> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<code_standards>');
    });

    it('should place <display_names> in static section only', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<display_names>');
      expect(result.static).toContain('</display_names>');
      expect(result.dynamic).not.toContain('<display_names>');
      expect(result.dynamic).not.toContain('</display_names>');
    });

    it('should place <canonical_example> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<canonical_example>');
    });

    it('should place <constraints> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<constraints>');
    });

    it('should place <visual_inspection> in static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<visual_inspection>');
    });

    it('should NOT contain chatId in static section', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, { chatId: 'test-chat-123' });
      expect(result.static).not.toContain('test-chat-123');
    });

    it('should place transcript path with chatId in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, { chatId: 'test-chat-123' });
      expect(result.dynamic).toContain('test-chat-123');
    });
  });

  // ===================================================================
  // Model self-awareness
  // ===================================================================

  describe('model self-awareness', () => {
    it('should include model name in dynamic section when modelId provided', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        chatId: 'test',
        modelId: 'anthropic-claude-sonnet-4.6',
      });
      expect(result.dynamic).toContain('anthropic-claude-sonnet-4.6');
    });

    it('should include <environment> section in dynamic', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        chatId: 'test',
        modelId: 'test-model',
        contextWindow: 200_000,
      });
      expect(result.dynamic).toContain('<environment>');
      expect(result.dynamic).toContain('200000');
    });

    it('should include knowledge cutoff in <environment> when provided', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        chatId: 'test',
        modelId: 'test-model',
        contextWindow: 200_000,
        knowledgeCutoff: '2025-08',
      });
      expect(result.dynamic).toContain('knowledge cutoff: 2025-08');
    });

    it('should omit knowledge cutoff from <environment> when not provided', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        chatId: 'test',
        modelId: 'test-model',
        contextWindow: 200_000,
      });
      expect(result.dynamic).not.toContain('knowledge cutoff');
    });

    it('should NOT include model info in static section', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, {
        chatId: 'test',
        modelId: 'test-model',
      });
      expect(result.static).not.toContain('test-model');
    });
  });

  // ===================================================================
  // Anti-vague-reference instruction
  // ===================================================================

  describe('anti-vague-reference instruction', () => {
    it('should include anti-delegation instruction in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).toMatch(/specific file paths|line numbers|never.*vague/i);
    });
  });

  // ===================================================================
  // Ack-then-work-then-result pattern
  // ===================================================================

  describe('ack-then-work-then-result pattern', () => {
    it('should include ack instruction in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).toMatch(/acknowledge the task|progress updates.*information/i);
    });
  });

  // ===================================================================
  // Golden structural test for section registry refactor
  // ===================================================================

  describe('golden structural test for section registry refactor', () => {
    const goldenOptions = {
      chatId: 'golden-test',
      modelId: 'test-model',
      contextWindow: 200_000,
      knowledgeCutoff: '2025-08',
    } as const;

    it('should contain all expected static sections', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, goldenOptions);

      const expectedSections = [
        '<role>',
        '</role>',
        '<workflow>',
        '</workflow>',
        '<tool_usage_policy>',
        '</tool_usage_policy>',
        '<constraints>',
        '</constraints>',
        '<tone>',
        '</tone>',
        '<test_requirements>',
        '</test_requirements>',
        '<visual_inspection>',
        '</visual_inspection>',
        '<code_standards>',
        '</code_standards>',
        '<display_names>',
        '</display_names>',
        '<topology_hints>',
        '</topology_hints>',
        '<error_handling>',
        '</error_handling>',
        '<system_rules>',
        '</system_rules>',
        '<safety>',
        '</safety>',
        '<geometry_fidelity>',
        '</geometry_fidelity>',
        '<canonical_example>',
        '</canonical_example>',
        '<research_capabilities>',
        '</research_capabilities>',
        '<transcript_search>',
        '</transcript_search>',
      ];

      for (const tag of expectedSections) {
        expect(result.static).toContain(tag);
      }
    });

    it('should contain all expected dynamic sections', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, goldenOptions);

      expect(result.dynamic).toContain('.tau/transcripts/golden-test.jsonl');
      expect(result.dynamic).toContain('<environment>');
      expect(result.dynamic).toContain('knowledge cutoff: 2025-08');
    });

    it('should place dynamic sections in correct order', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, goldenOptions);

      const transcriptIndex = result.dynamic.indexOf('.tau/transcripts/');
      const envIndex = result.dynamic.indexOf('<environment>');

      expect(transcriptIndex).toBeLessThan(envIndex);
    });

    it('should not have triple+ blank lines in output', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, goldenOptions);

      expect(result.static).not.toMatch(/\n{4,}/);
      expect(result.dynamic).not.toMatch(/\n{4,}/);
    });

    it('should not leak dynamic content into static prompt', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true, goldenOptions);

      expect(result.static).not.toContain('golden-test');
      expect(result.static).not.toContain('test-model');
      expect(result.static).not.toContain('M main.scad');
    });
  });

  // ===================================================================
  // Numeric length anchors
  // ===================================================================

  describe('numeric length anchors', () => {
    it('should include word-count limits in static prompt', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/<=\s*25\s*words/i);
      expect(result.static).toMatch(/<=\s*100\s*words/i);
    });
  });

  // ===================================================================
  // <system-reminder> recognition contract
  // ===================================================================

  describe('<system-reminder> recognition contract', () => {
    it('should declare a <system_reminder_contract> inside <error_handling>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<system_reminder_contract>');
      expect(result.static).toContain('</system_reminder_contract>');

      const errorBlock = result.static.slice(
        result.static.indexOf('<error_handling>'),
        result.static.indexOf('</error_handling>'),
      );
      expect(errorBlock).toContain('<system_reminder_contract>');
    });

    it('should explicitly state that <system-reminder> messages are NOT user input', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/<system-reminder>[\S\s]*?are not user input/i);
    });

    it('should instruct the model to stop the offending behaviour and pick one of (a)/(b)/(c)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/stop the behaviour/i);
      expect(result.static).toMatch(/\(a\)/);
      expect(result.static).toMatch(/\(b\)/);
      expect(result.static).toMatch(/\(c\)/);
    });

    it('should instruct the model NOT to echo / quote / apologise for the reminder', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toMatch(/never echo, quote, or apologise/i);
    });
  });

  // ===================================================================
  // <tone> static section
  // ===================================================================

  describe('tone block', () => {
    it('should include a <tone> static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<tone>');
      expect(result.static).toContain('</tone>');
    });

    it('should require objectivity (no flattery / congratulations / apology)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<tone>'), result.static.indexOf('</tone>'));
      expect(block).toMatch(/Be objective/);
      expect(block).toMatch(/flatter/i);
      expect(block).toMatch(/congratulate/i);
      expect(block).toMatch(/apologise/i);
    });

    it('should ban completion-time estimates and filler text', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<tone>'), result.static.indexOf('</tone>'));
      expect(block).toMatch(/estimate completion times/i);
      expect(block).toMatch(/filler/i);
    });

    it('should ban a colon before a tool call', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<tone>'), result.static.indexOf('</tone>'));
      expect(block).toMatch(/colon before a tool call/i);
    });

    it('should ban unrequested emojis', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<tone>'), result.static.indexOf('</tone>'));
      expect(block).toMatch(/emoji/i);
    });

    it('should NOT appear in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).not.toContain('<tone>');
    });
  });

  // ===================================================================
  // <test_requirements> top-level-export guidance (per-kernel)
  // ===================================================================

  describe('<test_requirements> top-level-export guidance (per-kernel)', () => {
    const allKernels: readonly KernelProvider[] = [
      'openrscad',
      'replicad',
      'jscad',
      'manifold',
      'opencascadejs',
      'zoo',
    ];

    const extractTestRequirementsBlock = (prompt: string): string =>
      prompt.slice(prompt.indexOf('<test_requirements>'), prompt.indexOf('</test_requirements>'));

    describe.each(allKernels)('%s', (kernel) => {
      it('should embed the kernel-specific top-level export example from KernelConfig.topLevelExportExample', async () => {
        const config = getKernelConfig(kernel);
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = extractTestRequirementsBlock(result.static);
        expect(block).toContain(config.topLevelExportExample);
      });

      it('should NOT mention legacy test-file editing', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = extractTestRequirementsBlock(result.static);
        expect(block).not.toMatch(/test\.json|edit_tests/i);
        expect(block).not.toMatch(/skip(?:ping)? the test/i);
      });

      it('should NOT bake in OpenSCAD-only "modules / functions" copy on non-OpenSCAD-language kernels', async () => {
        if (kernel === 'openrscad') {
          return;
        }
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = extractTestRequirementsBlock(result.static);
        expect(block).not.toMatch(/modules?\s*\/\s*functions?/i);
        expect(block).not.toMatch(/lib\/\S*\.scad/i);
      });

      it('should NOT use "compilation unit" or the "CU" acronym', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = extractTestRequirementsBlock(result.static);
        expect(block).not.toMatch(/compilation unit|\bCU\b/);
      });

      it('should encourage adding more tests rather than removing entries', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = extractTestRequirementsBlock(result.static);
        expect(block).toMatch(/add|cover|prefer/i);
      });
    });

    it('should not include the top-level-export guidance when testing is disabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', false);
      expect(result.static).not.toContain('<test_requirements>');
    });
  });

  // ===================================================================
  // Multi-shape pattern guidance for Replicad-style kernels
  // ===================================================================

  describe('<multi_shape_pattern> for kernels with a multi-shape return type', () => {
    const nonReplicadKernels: readonly KernelProvider[] = ['openrscad', 'jscad', 'manifold', 'opencascadejs', 'zoo'];

    it('should embed a Multi-shape pattern section in the Replicad prompt showing ShapeConfig[]', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      expect(result.static).toContain('<multi_shape_pattern>');
      expect(result.static).toContain('ShapeConfig[]');
    });

    it('should use Title Case labels in the Replicad multi-shape example', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractSection(result.static, 'multi_shape_pattern');
      const legacyWheelLeftLabel = `name: '${['Wheel', 'Left'].join('')}'`;
      const legacyWheelRightLabel = `name: '${['Wheel', 'Right'].join('')}'`;

      expect(block).toContain("name: 'Wheel Left'");
      expect(block).toContain("name: 'Wheel Right'");
      expect(block).not.toContain(legacyWheelLeftLabel);
      expect(block).not.toContain(legacyWheelRightLabel);
    });

    it('should explicitly note that connectedComponents:1 is appropriate when ShapeConfig parts touch', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractSection(result.static, 'multi_shape_pattern');
      expect(block).toContain('connectedComponents');
      expect(block).toMatch(/touch/i);
      expect(block).toMatch(/count":\s*1|count: 1/);
    });

    describe.each(nonReplicadKernels)('%s', (kernel) => {
      it('should NOT include the Multi-shape pattern section', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        expect(result.static).not.toContain('<multi_shape_pattern>');
      });
    });
  });

  // ===================================================================
  // Multi-file pattern guidance (per-kernel idiomatic library imports)
  //   Source: dollhouse `include`-duplicate smoking gun — `include <…>`
  //   re-emits every top-level invocation in the imported file, so a
  //   standalone `dollhouse_base()` call inside `lib/base.scad` renders
  //   alongside the assembled house. Each kernel ships a minimal
  //   multi-file canonical example so the agent mirrors the correct
  //   import token rather than guessing.
  // ===================================================================

  describe('<multi_file_pattern> for every kernel', () => {
    const allKernels: readonly KernelProvider[] = [
      'openrscad',
      'replicad',
      'jscad',
      'manifold',
      'opencascadejs',
      'zoo',
    ];

    describe.each(allKernels)('%s', (kernel) => {
      it('should embed a <multi_file_pattern> section in the static prompt', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        expect(result.static).toContain('<multi_file_pattern>');
        expect(result.static).toContain('</multi_file_pattern>');
      });

      it('should embed each declared file path verbatim', async () => {
        const config = getKernelConfig(kernel);
        const example = config.multiFileExample;
        if (!example) {
          throw new Error(`${kernel} must ship multiFileExample`);
        }
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        const block = result.static.slice(
          result.static.indexOf('<multi_file_pattern>'),
          result.static.indexOf('</multi_file_pattern>'),
        );
        for (const file of example.files) {
          expect(block).toContain(`\`${file.path}\``);
        }
      });

      it('should NOT leak into the dynamic prompt', async () => {
        const result = await getCadSystemPrompt(kernel, 'agent', true);
        expect(result.dynamic).not.toContain('<multi_file_pattern>');
      });
    });

    it('should render OpenSCAD with `use <…>` and never `include <…>` (regression guard)', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = result.static.slice(
        result.static.indexOf('<multi_file_pattern>'),
        result.static.indexOf('</multi_file_pattern>'),
      );
      expect(block).toMatch(/use\s*</);
      expect(block).not.toMatch(/include\s*</);
    });

    it("should render TS-based kernels with `from './lib/<name>.js'` ESM relative imports", async () => {
      const tsKernels = ['replicad', 'jscad', 'manifold', 'opencascadejs'] as const;
      const results = await Promise.all(tsKernels.map(async (k) => getCadSystemPrompt(k, 'agent', true)));
      for (const result of results) {
        const block = result.static.slice(
          result.static.indexOf('<multi_file_pattern>'),
          result.static.indexOf('</multi_file_pattern>'),
        );
        expect(block).toMatch(/from\s+["']\.\/lib\/[\w-]+\.js["']/);
      }
    });

    it('should render KCL flat (no `lib/`) with the `import … from "…"` idiom', async () => {
      const result = await getCadSystemPrompt('zoo', 'agent', true);
      const block = result.static.slice(
        result.static.indexOf('<multi_file_pattern>'),
        result.static.indexOf('</multi_file_pattern>'),
      );
      expect(block).not.toContain('lib/');
      expect(block).toMatch(/import\s+\w+\s+from\s+"[^"]+\.kcl"/);
    });
  });

  // ===================================================================
  // Display-name casing contract
  // ===================================================================

  describe('<display_names> display-label casing contract', () => {
    it('should define Title Case examples and non-examples for authored display labels', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractSection(result.static, 'display_names');

      expect(block).toContain('Title Case words with spaces');
      expect(block).toContain('Valve Cover Left');
      expect(block).toContain('Bank Angle');
      expect(block).toContain('Shape 1');
      expect(block).toContain('ValveCover_L');
      expect(block).toContain('wheelLeft');
      expect(block).toContain('bank_angle');
      expect(block).toContain('BankAngle');
    });

    it('should scope Title Case to display labels and preserve kernel-native code identifiers', async () => {
      const replicad = await getCadSystemPrompt('replicad', 'agent', true);
      const openscad = await getCadSystemPrompt('openrscad', 'agent', true);
      const zoo = await getCadSystemPrompt('zoo', 'agent', true);

      expect(extractSection(replicad.static, 'display_names')).toContain('Keep code identifiers idiomatic');
      expect(extractSection(replicad.static, 'code_standards')).toContain('Use camelCase for variables');
      expect(extractSection(zoo.static, 'code_standards')).toContain('Use camelCase for variables');
      expect(extractSection(openscad.static, 'code_standards')).toContain('Use snake_case for variables');
    });

    it('should carry the display-label rule once in the CAD static prompt and never in dynamic context', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);

      expect(countOccurrences(result.static, '<display_names>')).toBe(1);
      expect(countOccurrences(result.static, '</display_names>')).toBe(1);
      expect(countOccurrences(result.static, 'Title Case words with spaces')).toBe(1);
      expect(result.dynamic).not.toContain('Title Case words with spaces');
    });
  });

  // ===================================================================
  // Screenshot frequency cap in <visual_inspection>
  // ===================================================================

  describe('screenshot budget cap', () => {
    it('should cap screenshots at 2 per inspection cycle inside <visual_inspection>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<visual_inspection>'),
        result.static.indexOf('</visual_inspection>'),
      );
      expect(block).toMatch(/at most 2 screenshots/i);
    });

    it('should warn against chaining a single screenshot after multi_angle', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<visual_inspection>'),
        result.static.indexOf('</visual_inspection>'),
      );
      expect(block).toMatch(/multi_angle/);
      expect(block).toMatch(/six orthographic views/i);
    });
  });

  // ===================================================================
  // <tool_usage_policy> static section
  // ===================================================================

  describe('tool usage policy', () => {
    it('should include a <tool_usage_policy> static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<tool_usage_policy>');
      expect(result.static).toContain('</tool_usage_policy>');
    });

    it('should instruct to call independent tools in parallel and dependent ones sequentially', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<tool_usage_policy>'),
        result.static.indexOf('</tool_usage_policy>'),
      );
      expect(block).toMatch(/parallel/i);
      expect(block).toMatch(/sequentially/i);
    });

    it('should forbid placeholder values in tool calls', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<tool_usage_policy>'),
        result.static.indexOf('</tool_usage_policy>'),
      );
      expect(block).toMatch(/never use placeholders/i);
    });

    it('should direct the agent to prefer offset and limit for large source reads', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<tool_usage_policy>'),
        result.static.indexOf('</tool_usage_policy>'),
      );
      expect(block).toMatch(/prefer `offset` \+ `limit`/);
      expect(block).toMatch(/>2000 lines/);
    });

    it('should direct the agent to use narrow grep + headLimit before read_file on dense generated code', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<tool_usage_policy>'),
        result.static.indexOf('</tool_usage_policy>'),
      );
      expect(block).toMatch(/narrow regex/);
      expect(block).toMatch(/headLimit/);
      expect(block).toMatch(/most-relevant ranges/);
    });

    it('should NOT steer the agent into node_modules via <tool_usage_policy>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<tool_usage_policy>'),
        result.static.indexOf('</tool_usage_policy>'),
      );
      expect(block).not.toMatch(/node_modules/);
      expect(block).not.toMatch(/canonical location/);
    });

    it('should NOT appear in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).not.toContain('<tool_usage_policy>');
    });
  });

  // ===================================================================
  // Faithful-reporting bullet in <constraints>
  // ===================================================================

  describe('faithful reporting', () => {
    it('should include a faithful-reporting bullet inside <constraints>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const constraintsBlock = result.static.slice(
        result.static.indexOf('<constraints>'),
        result.static.indexOf('</constraints>'),
      );
      expect(constraintsBlock).toContain('Report outcomes faithfully');
      expect(constraintsBlock).toContain('"all tests pass"');
      expect(constraintsBlock).toContain('incomplete work as done');
      expect(constraintsBlock).toContain('without hedging');
    });
  });

  // ===================================================================
  // Diagnose-before-switching guidance in <error_handling>
  //   Source: claude-code repos/claude-code/src/constants/prompts.ts:233
  // ===================================================================

  describe('diagnose-before-switching tactics', () => {
    it('should map render timeouts to source-level cost diagnosis without degrading design intent', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const errorBlock = result.static.slice(
        result.static.indexOf('<error_handling>'),
        result.static.indexOf('</error_handling>'),
      );
      expect(errorBlock).toContain('RENDER_TIMEOUT');
      expect(errorBlock).toMatch(/recent edits.*parameter values.*tessellation-heavy/i);
      expect(errorBlock).toMatch(/never reduce modeled detail or degrade design intent/i);
      expect(errorBlock).toMatch(/ask the user/i);
    });

    it('should tell the model to diagnose before switching tactics inside <error_handling>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const errorBlock = result.static.slice(
        result.static.indexOf('<error_handling>'),
        result.static.indexOf('</error_handling>'),
      );
      expect(errorBlock).toContain('diagnose');
      expect(errorBlock).toContain('switching tactics');
      expect(errorBlock).toContain('identical action');
    });

    it('should NOT contain the deleted "stop after 1-2 retries" guidance', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).not.toContain('stop after 1-2 retries');
    });

    it('should warn against abandoning a viable approach after a single failure', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const errorBlock = result.static.slice(
        result.static.indexOf('<error_handling>'),
        result.static.indexOf('</error_handling>'),
      );
      expect(errorBlock).toMatch(/single failure/i);
    });
  });

  // ===================================================================
  // Plan mode and testing mode behavior
  // ===================================================================

  describe('mode and testing variations', () => {
    it('should include <plan_mode> in static when mode is plan', async () => {
      const result = await getCadSystemPrompt('openrscad', 'plan');
      expect(result.static).toContain('<plan_mode>');
    });

    it('should include <test_requirements> in static when testing enabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      expect(result.static).toContain('<test_requirements>');
    });

    it('should omit <test_requirements> when testing disabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', false);
      expect(result.static).not.toContain('<test_requirements>');
    });
  });

  // ===================================================================
  // Destructive-action <safety> static section
  // ===================================================================

  describe('<safety> static section', () => {
    it('should include a <safety> static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<safety>');
      expect(result.static).toContain('</safety>');
    });

    it('should warn before delete_file removes a referenced file', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<safety>'), result.static.indexOf('</safety>'));
      expect(block).toMatch(/delete_file/);
      expect(block).toMatch(/referenced/);
    });

    it('should warn before overwriting a previously-committed export artifact', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<safety>'), result.static.indexOf('</safety>'));
      expect(block).toMatch(/overwrit/i);
      expect(block).toMatch(/committed/i);
    });

    it('should warn before mutating a mounted filesystem path', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(result.static.indexOf('<safety>'), result.static.indexOf('</safety>'));
      expect(block).toMatch(/mount/);
    });

    it('should NOT appear in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).not.toContain('<safety>');
    });
  });

  // ===================================================================
  // Global <geometry_fidelity> static section
  //   Closes the helical-gear `involuteSamples=9` smoking gun per
  //   docs/research/code-cad-topology-best-practices.md F1, F3-F5, F9.
  // ===================================================================

  describe('<geometry_fidelity> static section', () => {
    const extractBlock = (prompt: string) =>
      prompt.slice(prompt.indexOf('<geometry_fidelity>'), prompt.indexOf('</geometry_fidelity>'));

    it('should include a <geometry_fidelity> static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<geometry_fidelity>');
      expect(result.static).toContain('</geometry_fidelity>');
    });

    it('should anchor on the smallest-topology universal principle', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/smallest topology that captures the user's intent/i);
      expect(block).toMatch(/topology is the deliverable/i);
    });

    it('should name the closed-form curve families (F1)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/curves with a closed form/i);
      expect(block).toMatch(/involutes/i);
      expect(block).toMatch(/ellipses/i);
      expect(block).toMatch(/helices/i);
      expect(block).toMatch(/single analytical primitive/i);
    });

    it('should call out engineering profiles as analytical edges (F1)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/engineering profiles/i);
      expect(block).toMatch(/its own analytical edge/i);
    });

    it('should prefer one revolve/loft/sweep over a stack of unioned primitives (F3)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/revolve/i);
      expect(block).toMatch(/loft/i);
      expect(block).toMatch(/sweep/i);
      expect(block).toMatch(/stack of primitives unioned together/i);
    });

    it('should encode boolean ordering hygiene (F4)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/bottom-up additive, top-down subtractive/i);
      expect(block).toMatch(/fewer, larger booleans/i);
      expect(block).toMatch(/epsilon past the boundary/i);
    });

    it('should encode fillet ordering (F5)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/largest, most stable features first/i);
      expect(block).toMatch(/part-vs-part shared boundary last/i);
    });

    it('should surface the for-loop self-detection heuristic (F9)', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/`for`-loop pushing points into an array/i);
      expect(block).toMatch(/closed form/i);
      expect(block).toMatch(/switch to the analytical primitive/i);
    });

    it('should point the agent at <topology_hints> for kernel-specific vocabulary', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/<topology_hints>/);
    });

    it('should NOT appear in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).not.toContain('<geometry_fidelity>');
    });
  });

  // ===================================================================
  // Per-kernel <topology_hints> static section
  //   Maps the global <geometry_fidelity> principle to each kernel's
  //   primitive vocabulary per docs/research/code-cad-topology-best-practices.md
  //   Kernel Capability Matrix.
  // ===================================================================

  describe('<topology_hints> static section', () => {
    const extractBlock = (prompt: string) =>
      prompt.slice(prompt.indexOf('<topology_hints>'), prompt.indexOf('</topology_hints>'));

    const allKernels: readonly KernelProvider[] = [
      'openrscad',
      'replicad',
      'jscad',
      'manifold',
      'opencascadejs',
      'zoo',
    ];

    describe.each(allKernels)('%s', (kernel) => {
      it('should include a <topology_hints> static section', async () => {
        const result = await getCadSystemPrompt(kernel);
        expect(result.static).toContain('<topology_hints>');
        expect(result.static).toContain('</topology_hints>');
      });

      it('should not be empty', async () => {
        const result = await getCadSystemPrompt(kernel);
        const block = extractBlock(result.static).replace('<topology_hints>', '').trim();
        expect(block.length).toBeGreaterThan(40);
      });

      it('should NOT appear in dynamic section', async () => {
        const result = await getCadSystemPrompt(kernel);
        expect(result.dynamic).not.toContain('<topology_hints>');
      });
    });

    describe('kernel-specific vocabulary', () => {
      it('replicad should name drawSplineCurve / drawArc', async () => {
        const result = await getCadSystemPrompt('replicad');
        const block = extractBlock(result.static);
        expect(block).toMatch(/drawSplineCurve/);
        expect(block).toMatch(/drawArc/);
      });

      it('opencascadejs should name Geom2dAPI_PointsToBSpline and GC_MakeArcOfCircle', async () => {
        const result = await getCadSystemPrompt('opencascadejs');
        const block = extractBlock(result.static);
        expect(block).toMatch(/Geom2dAPI_PointsToBSpline/);
        expect(block).toMatch(/GC_MakeArcOfCircle/);
      });

      it('zoo (KCL) should name tangentialArc and bezierCurve', async () => {
        const result = await getCadSystemPrompt('zoo');
        const block = extractBlock(result.static);
        expect(block).toMatch(/tangentialArc/);
        expect(block).toMatch(/bezierCurve/);
      });

      it('manifold should encode the segment-count heuristic', async () => {
        const result = await getCadSystemPrompt('manifold');
        const block = extractBlock(result.static);
        expect(block).toMatch(/segment count, not curve form/i);
        expect(block).toMatch(/Manifold\.cylinder/);
      });

      it('jscad should encode the segment-count heuristic and extrudeRotate', async () => {
        const result = await getCadSystemPrompt('jscad');
        const block = extractBlock(result.static);
        expect(block).toMatch(/segment count, not curve form/i);
        expect(block).toMatch(/extrudeRotate/);
        expect(block).toContain('compose the 2D profile');
        expect(block).toContain('call `extrudeLinear` once');
        expect(block).toMatch(/non-manifold `geom3`/i);
        expect(block).toMatch(/named\(shape, 'Part Name'\)/);
      });

      it('openscad should prefer $fa/$fs over $fn and warn on hull/minkowski misuse', async () => {
        const result = await getCadSystemPrompt('openrscad');
        const block = extractBlock(result.static);
        expect(block).toMatch(/\$fa/);
        expect(block).toMatch(/\$fs/);
        expect(block).toMatch(/hull\(\)/);
        expect(block).toMatch(/minkowski\(\)/);
        expect(block).toMatch(/render\(\)/);
      });
    });

    describe('cross-kernel contamination guard', () => {
      it('replicad <topology_hints> should not leak OpenSCAD-only vocabulary', async () => {
        const result = await getCadSystemPrompt('replicad');
        const block = extractBlock(result.static);
        expect(block).not.toMatch(/\$fa/);
        expect(block).not.toMatch(/\$fs/);
        expect(block).not.toMatch(/\$fn/);
        expect(block).not.toMatch(/hull\(\)/);
      });

      it('opencascadejs <topology_hints> should not leak Replicad-only vocabulary', async () => {
        const result = await getCadSystemPrompt('opencascadejs');
        const block = extractBlock(result.static);
        expect(block).not.toMatch(/drawSplineCurve/);
        expect(block).not.toMatch(/drawArc/);
      });

      it('openscad <topology_hints> should not leak B-rep curve vocabulary', async () => {
        const result = await getCadSystemPrompt('openrscad');
        const block = extractBlock(result.static);
        expect(block).not.toMatch(/drawSplineCurve/);
        expect(block).not.toMatch(/Geom2dAPI_PointsToBSpline/);
        expect(block).not.toMatch(/tangentialArc/);
      });

      it('manifold <topology_hints> should not leak B-rep curve vocabulary', async () => {
        const result = await getCadSystemPrompt('manifold');
        const block = extractBlock(result.static);
        expect(block).not.toMatch(/drawSplineCurve/);
        expect(block).not.toMatch(/Geom2dAPI_PointsToBSpline/);
        expect(block).not.toMatch(/tangentialArc/);
      });
    });
  });

  // ===================================================================
  // <error_handling> fillet root-cause extension (F5)
  // ===================================================================

  describe('<error_handling> fillet root-cause extension', () => {
    const extractBlock = (prompt: string) =>
      prompt.slice(prompt.indexOf('<error_handling>'), prompt.indexOf('</error_handling>'));

    it('should name polyline kinks and oversized radius as the two root causes', async () => {
      const result = await getCadSystemPrompt('replicad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/Fillet failures/);
      expect(block).toMatch(/polyline kink upstream/i);
      expect(block).toMatch(/radius larger than local material thickness/i);
    });

    it('should cross-reference <geometry_fidelity>', async () => {
      const result = await getCadSystemPrompt('replicad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/<geometry_fidelity>/);
    });

    it('should encode largest-fillets-first ordering', async () => {
      const result = await getCadSystemPrompt('replicad');
      const block = extractBlock(result.static);
      expect(block).toMatch(/largest fillets first/i);
      expect(block).toMatch(/part-vs-part shared boundary last/i);
    });
  });

  // ===================================================================
  // Export gate — `export_geometry` is opt-in only
  // ===================================================================

  describe('<safety> export gate', () => {
    const extractSafety = (prompt: string): string =>
      prompt.slice(prompt.indexOf('<safety>'), prompt.indexOf('</safety>'));

    it('should mention export_geometry inside <safety>', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractSafety(result.static);
      expect(block).toContain('export_geometry');
    });

    it('should require an explicit user request before calling export_geometry', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractSafety(result.static);
      expect(block).toMatch(/explicitly ask/i);
    });

    it('should follow the `Before X, confirm Y` style used by other safety bullets', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractSafety(result.static);
      expect(block).toMatch(/Before calling `export_geometry`, confirm/);
      expect(block).not.toMatch(/Never call `export_geometry`/);
    });

    it('should still keep the previously-committed-overwrite warning', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = extractSafety(result.static);
      expect(block).toMatch(/overwrit/i);
      expect(block).toMatch(/committed/i);
    });
  });

  describe('workflow does not list export as a step', () => {
    const extractWorkflow = (prompt: string): string =>
      prompt.slice(prompt.indexOf('<workflow>'), prompt.indexOf('</workflow>'));

    it('should not list export_geometry inside the workflow when testing enabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractWorkflow(result.static);
      expect(block).not.toContain('export_geometry');
      expect(block).not.toContain('exportGeometry');
      expect(block).not.toContain('Deliver interchange');
    });

    it('should not list export_geometry inside the workflow when testing disabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', false);
      const block = extractWorkflow(result.static);
      expect(block).not.toContain('export_geometry');
      expect(block).not.toContain('exportGeometry');
      expect(block).not.toContain('Deliver interchange');
    });
  });

  // ===================================================================
  // <system_rules> (no-identical-retry on denial, URL guard)
  // ===================================================================

  describe('<system_rules> static section', () => {
    it('should include a <system_rules> static section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.static).toContain('<system_rules>');
      expect(result.static).toContain('</system_rules>');
    });

    it('should forbid re-attempting the identical call after a denial / permission error', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<system_rules>'),
        result.static.indexOf('</system_rules>'),
      );
      expect(block).toMatch(/denial or permission error/i);
      expect(block).toMatch(/identical call/i);
    });

    it('should forbid inventing URLs', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<system_rules>'),
        result.static.indexOf('</system_rules>'),
      );
      expect(block).toMatch(/Never invent URLs/);
      expect(block).toMatch(/web_search/);
    });

    it('should NOT appear in dynamic section', async () => {
      const result = await getCadSystemPrompt('openrscad');
      expect(result.dynamic).not.toContain('<system_rules>');
    });
  });

  // ===================================================================
  // Self-grounded verification prepend in <visual_inspection>
  // ===================================================================

  describe('self-grounded verification', () => {
    it('should require predicting expected properties before taking the screenshot', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<visual_inspection>'),
        result.static.indexOf('</visual_inspection>'),
      );
      expect(block).toMatch(/predict the expected properties/i);
      expect(block).toMatch(/vertex-count range/i);
      expect(block).toMatch(/bounding box/i);
      expect(block).toMatch(/silhouette/i);
    });

    it('should require comparing prediction against actual render', async () => {
      const result = await getCadSystemPrompt('openrscad');
      const block = result.static.slice(
        result.static.indexOf('<visual_inspection>'),
        result.static.indexOf('</visual_inspection>'),
      );
      expect(block).toMatch(/Compare against the actual render/);
    });
  });

  // ===================================================================
  // Iterative verification loop — universal, no <complex_task> dep
  // ===================================================================

  describe('iterative verification loop', () => {
    it('should require re-render on any defect found in the inspect step (testing enabled)', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/re-render/i);
      expect(workflow).toMatch(/Continue iterating until no defects remain/);
    });

    it('should require re-render on any defect found in the inspect step (testing disabled)', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', false);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/re-render/i);
      expect(workflow).toMatch(/Continue iterating until no defects remain/);
    });

    it('should NOT reference the deferred <complex_task> tag or "2 cycles" sub-rule', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).not.toContain('complex_task');
      expect(workflow).not.toMatch(/2 cycles/i);
    });
  });

  // ===================================================================
  // Workflow step 0 (decompose) — universal, no <complex_task> dep
  // ===================================================================

  describe('workflow step 0 (decompose)', () => {
    it('should prepend a step 0 (Decompose) to the workflow when testing enabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/0\.\s*\*\*Decompose\*\*/);
      expect(workflow).toMatch(/multi-component/i);
    });

    it('should require a mini design brief for complex/high-fidelity requests before code', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/mini design brief/i);
      expect(workflow).toMatch(/assembly tree/i);
      expect(workflow).toMatch(/major visible features/i);
      expect(workflow).toMatch(/key dimensions\/assumptions/i);
      expect(workflow).toMatch(/materials\/surface treatments/i);
      expect(workflow).toMatch(/verification targets/i);
    });

    it('should preserve workflow numbering through step 6 when testing enabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      for (const stepNumber of [0, 1, 2, 3, 4, 5, 6]) {
        expect(workflow).toMatch(new RegExp(`${stepNumber}\\.\\s\\*\\*`));
      }
    });

    it('should include a "skip when single shape / trivial parameter change" escape hatch', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/skip when/i);
      expect(workflow).toMatch(/single shape|trivial parameter/i);
    });

    it('should NOT reference the deferred <complex_task> tag', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).not.toContain('<complex_task>');
      expect(workflow).not.toContain('complex_task');
    });

    it('should still prepend step 0 when testing is disabled', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', false);
      const workflow = result.static.slice(result.static.indexOf('<workflow>'), result.static.indexOf('</workflow>'));
      expect(workflow).toMatch(/0\.\s*\*\*Decompose\*\*/);
    });
  });

  // ===================================================================
  // Plan-mode strictness
  //   Source: claude-code system-reminder-plan-mode-is-active-iterative.md L12
  // ===================================================================

  describe('plan-mode strictness', () => {
    it('should forbid all non-readonly tool calls except .plan.md edit when in plan mode', async () => {
      const result = await getCadSystemPrompt('openrscad', 'plan');
      const block = result.static.slice(result.static.indexOf('<plan_mode>'), result.static.indexOf('</plan_mode>'));
      expect(block).toMatch(/MUST NOT make any edits/);
      expect(block).toMatch(/non-readonly tools/i);
      expect(block).toMatch(/\.plan\.md/);
    });

    it('should state that the plan-mode rules supersede other instructions', async () => {
      const result = await getCadSystemPrompt('openrscad', 'plan');
      const block = result.static.slice(result.static.indexOf('<plan_mode>'), result.static.indexOf('</plan_mode>'));
      expect(block).toMatch(/supersedes/i);
    });

    it('should NOT include the plan-mode block when mode is agent', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent');
      expect(result.static).not.toContain('<plan_mode>');
      expect(result.static).not.toContain('MUST NOT make any edits');
    });

    it('should still tell the model to stop after creating the plan', async () => {
      const result = await getCadSystemPrompt('openrscad', 'plan');
      const block = result.static.slice(result.static.indexOf('<plan_mode>'), result.static.indexOf('</plan_mode>'));
      expect(block).toMatch(/Stop after creating the plan/);
    });
  });

  // ===================================================================
  // GeoSpec test file migration
  // ===================================================================

  describe('GeoSpec test file shape in <test_requirements>', () => {
    const extractTestRequirements = (prompt: string) =>
      /<test_requirements>([\S\s]*?)<\/test_requirements>/.exec(prompt)?.[1] ?? '';

    it('should embed the GeoSpec authoring shape in <test_requirements>', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);

      expect(block).toContain('*.geospec.ts');
      expect(block).toContain("import { describe, expectGeo, it } from 'geospec'");
      expect(block).toContain("import { loadModel } from 'geospec/model'");
      expect(block).toContain('parameters: { width, height }');
      expect(countOccurrences(block, 'parameters: { width, height }')).toBe(1);
      expect(block).not.toMatch(/^\s*{\s*"requirements"\s*:/);
    });

    it('should route BRep feature examples only to BRep-capable kernels', async () => {
      const replicad = await getCadSystemPrompt('replicad', 'agent', true);
      const openscad = await getCadSystemPrompt('openrscad', 'agent', true);
      const opencascade = await getCadSystemPrompt('opencascadejs', 'agent', true);

      expect(extractTestRequirements(replicad.static)).toContain('toHavePlanarFace');
      expect(extractTestRequirements(replicad.static)).toContain('toBeValidBrep');
      expect(extractTestRequirements(replicad.static)).toContain('toHaveChamferFeature');
      expect(extractTestRequirements(replicad.static)).toContain('toHaveMinimumWallThickness');
      expect(extractTestRequirements(replicad.static)).toContain("loadModel({ file: 'main.ts', format: 'step' })");
      expect(extractTestRequirements(opencascade.static)).toContain('toHavePlanarFace');
      expect(extractTestRequirements(opencascade.static)).toContain('toBeValidBrep');
      expect(extractTestRequirements(opencascade.static)).toContain('toHaveChamferFeature');
      expect(extractTestRequirements(opencascade.static)).toContain('toHaveMinimumWallThickness');
      expect(extractTestRequirements(opencascade.static)).toContain("loadModel({ file: 'main.ts', format: 'step' })");
      expect(extractTestRequirements(openscad.static)).not.toContain('toHavePlanarFace');
      expect(extractTestRequirements(openscad.static)).not.toContain('toBeValidBrep');
      expect(extractTestRequirements(openscad.static)).not.toContain('toHaveChamferFeature');
      expect(extractTestRequirements(openscad.static)).not.toContain("format: 'step'");
    });

    it('should teach OpenSCAD tests to load source files directly without wrapper workarounds', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);

      expect(block).toContain("loadModel({ file: 'main.scad' })");
      expect(block).not.toMatch(/\.ts wrapper|typescript wrapper|fake wrapper/i);
    });

    it('should explain that adding a new file requires preserving sibling GeoSpec coverage', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);
      expect(block).toMatch(/geospec test|matching geospec/i);
      expect(block).toMatch(/preserve|never delete|do not delete|keep sibling/i);
    });

    it('should reject whole-model bounding box plus physical properties as sufficient for high-fidelity assemblies', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);
      expect(block).toMatch(/coverage floor/i);
      expect(block).toMatch(/whole-model bounding box plus physical properties is never sufficient/i);
      expect(block).toMatch(/every major component and named visible feature/i);
      expect(block).toMatch(/per-component dimensions or positions/i);
      expect(block).toMatch(/state the missing coverage explicitly/i);
    });

    it('should embed the mesh-capable GeoSpec vocabulary in the canonical example', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);
      expect(block).toContain('boundingBox');
      expect(block).toContain('connectedComponents');
      expect(block).toContain('watertight');
      expect(block).toContain('toHaveNoComponentInterference');
      expect(block).toContain('surfaceArea');
      expect(block).toContain('volume');
      expect(block).toContain('centerOfMass');
      expect(block).not.toContain('meshCount');
      expect(block).not.toContain('vertexCount');
    });

    it('should describe the mesh checks with their unique-question framing and the connectedComponents tolerance knob', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);
      expect(block).toMatch(/Available checks/);
      expect(block).toContain('SIZE / POSITION');
      expect(block).toContain('SPATIALLY-DISJOINT CHUNKS');
      expect(block).toContain('CLOSED (strict manifold topology)');
      expect(block).toContain('separate assembly components occupy the same solid volume');
      expect(block).toContain('tolerance');
      expect(block).toContain('default 0.1');
    });

    it('should not expose shortcut component-overlap knobs or AABB/envelope guidance', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);

      expect(block).not.toContain('components:');
      expect(block).not.toContain('volumeTolerance');
      expect(block).not.toContain('sampleCount');
      expect(block).not.toContain('AABB');
      expect(block).not.toContain('envelope');
      expect(block).not.toContain('toHaveNoInterference');
    });

    it('should teach agents to assert through expectGeo instead of GeometrySubject internals', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractTestRequirements(result.static);
      expect(block).toContain('opaque `GeometrySubject`');
      expect(block).toContain('model.boundingBox.bounds');
      expect(block).toContain('model.volume()');
      expect(block).toContain('expectGeo(model)');
    });

    it('should not expose unit or preview workarounds in model-facing GeoSpec guidance', async () => {
      const result = await getCadSystemPrompt('openrscad', 'agent', true);
      const block = extractTestRequirements(result.static);

      expect(block).not.toContain('S = 1000');
      expect(block).not.toContain('previewGeometry');
      expect(block).not.toContain('test.json');
      expect(block).not.toMatch(/loadModel\([^)]*(?:scale|sourceUnit|coordinateSystem)/);
      expect(block).not.toMatch(/loadModel\([^)]*unit\s*:/);
      expect(block).not.toMatch(/loadModel\([^)]*kernel\s*:/);
    });
  });

  // ===================================================================
  // <error_handling> guidance for connectedComponents failures
  // ===================================================================

  describe('<error_handling> stops prescribing screenshots for connectedComponents failures', () => {
    const extractErrorHandling = (prompt: string) =>
      /<error_handling>([\S\s]*?)<\/error_handling>/.exec(prompt)?.[1] ?? '';

    it('should not tell the agent to use screenshot for connectedComponents failures', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractErrorHandling(result.static);
      expect(block).not.toMatch(/screenshot[^.]*connectedComponents/);
      expect(block).not.toMatch(/connectedComponents[^.]*screenshot/);
    });

    it('should encourage diagnosing whether the requirement still matches the agent intent', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractErrorHandling(result.static);
      expect(block).toMatch(/intent|tolerance/i);
    });

    it('should treat GeoSpec failures as model-code evidence before changing tests', async () => {
      const result = await getCadSystemPrompt('replicad', 'agent', true);
      const block = extractErrorHandling(result.static);
      expect(block).toMatch(/model code first/i);
      expect(block).toMatch(/fix the modeled geometry at the root cause/i);
      expect(block).toMatch(
        /do not remove detail, reduce geometry, weaken tolerances, drop assertions, or delete coverage/i,
      );
      expect(block).toMatch(/only update a geospec assertion.*contradicts the user's stated intent/i);
    });
  });

  // ===================================================================
  // Per-section telemetry hook
  // ===================================================================

  describe('onSectionResolved telemetry callback', () => {
    it('should invoke onSectionResolved for every non-empty static section (incl. role and workflow)', async () => {
      const onSectionResolved = vi.fn();
      await getCadSystemPrompt('openrscad', 'agent', true, { onSectionResolved });

      const calls = onSectionResolved.mock.calls.map(([resolved]) => resolved as { name: string; cacheBreak: boolean });
      const names = new Set(calls.map((c) => c.name));

      expect(names).toContain('role');
      expect(names).toContain('workflow');
      expect(names).toContain('constraints');
      expect(names).toContain('tone');
      expect(names).toContain('display_names');
    });

    it('should tag dynamic sections with cacheBreak: true and static ones with cacheBreak: false', async () => {
      const onSectionResolved = vi.fn();
      await getCadSystemPrompt('openrscad', 'agent', true, {
        onSectionResolved,
        chatId: 'chat-r23',
        modelId: 'm-r23',
        contextWindow: 200_000,
      });

      const calls = onSectionResolved.mock.calls.map(([resolved]) => resolved as { name: string; cacheBreak: boolean });
      const role = calls.find((c) => c.name === 'role');
      const displayNames = calls.find((c) => c.name === 'display_names');
      const environment = calls.find((c) => c.name === 'environment');
      const transcriptPath = calls.find((c) => c.name === 'transcript_path');

      expect(role?.cacheBreak).toBe(false);
      expect(displayNames?.cacheBreak).toBe(false);
      expect(environment?.cacheBreak).toBe(true);
      expect(transcriptPath?.cacheBreak).toBe(true);
    });

    it('should report positive byte sizes for every observation', async () => {
      const onSectionResolved = vi.fn();
      await getCadSystemPrompt('openrscad', 'agent', true, { onSectionResolved });

      for (const [resolved] of onSectionResolved.mock.calls) {
        const observation = resolved as { name: string; byteSize: number };
        expect(observation.byteSize).toBeGreaterThan(0);
      }
    });
  });
});
