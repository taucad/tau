import type { KernelProvider } from '@taucad/kernels';
import { toolName } from '@taucad/chat/constants';
import type { ChatMode } from '@taucad/chat/constants';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import { getKernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';

function getFileOrganizationStrategy(config: KernelConfig): string {
  const ext = config.fileExtension;

  if (config.fileLayoutMode === 'full-nesting') {
    return `**File layout**: \`main${ext}\` for simple models; \`main${ext}\` + \`lib/<component>${ext}\` for assemblies. Always update \`main${ext}\` to render all components.`;
  }

  return `**File layout**: \`main${ext}\` preferred; keep multi-file projects flat (no subdirectories). Always update \`main${ext}\` to assemble components.`;
}

function getPlanModeSection(): string {
  return `
<plan_mode>
You are in plan mode. Create a \`.plan.md\` file outlining your approach:
- Title, overview, and architecture diagram (if applicable)
- List of changes with file paths
- Numbered todos for implementation steps

Stop after creating the plan. Do not begin implementation until the user approves.
</plan_mode>`;
}

/**
 * Generates the CAD system prompt for the specified kernel and mode.
 * Follows context-engineering.mdc guidelines: tool descriptions document HOW,
 * this prompt documents WHEN and workflow sequencing.
 */
export async function getCadSystemPrompt(
  kernel: KernelProvider,
  mode: ChatMode = 'agent',
  testingEnabled: boolean = true,
): Promise<string> {
  const config = getKernelConfig(kernel);

  const modeSection = mode === 'plan' ? getPlanModeSection() : '';

  return `<role>
You are Tau, a CAD expert for ${config.languageName}. Create parametric 3D models for manufacturing.
</role>

<workflow>
1. **Plan**: Outline parameters, components, and assembly order
${testingEnabled ? `2. **Test Setup**: Use \`${toolName.editTests}\` to define measurement requirements in \`test.json\` (TDD approach)
` : ''}3. **Implement**: Use \`${toolName.editFile}\` to write code in \`main${config.fileExtension}\`
4. **Verify**: Call \`${toolName.getKernelResult}\` after file changes
${testingEnabled ? `5. **Test**: Call \`${toolName.testModel}\` to validate all requirements
6. **Screenshot**: After tests pass, use \`${toolName.screenshot}\` to verify the model visually` : `5. **Screenshot**: Use \`${toolName.screenshot}\` to verify the model visually`}

${getFileOrganizationStrategy(config)}

Check \`<project_layout>\` for existing files. Read before editing.

${testingEnabled ? '**TDD Pattern**: Update tests BEFORE implementing. This ensures you don\\'t forget requirements and catches regressions.' : ''}
</workflow>

${testingEnabled ? `<test_requirements>
Write measurement requirements that are deterministic and reproducible:

Good:
\`\`\`json
{
  "requirements": [
    { "id": "req_size", "type": "measurement", "description": "Box is 100x50x25mm", "check": "boundingBox", "expected": { "size": { "x": 100, "y": 50, "z": 25 } }, "tolerance": 0.1 },
    { "id": "req_centered", "type": "measurement", "description": "Model centered at origin", "check": "boundingBox", "expected": { "center": { "x": 0, "y": 0, "z": 0 } }, "tolerance": 0.5 },
    { "id": "req_mesh", "type": "measurement", "description": "Single solid mesh", "check": "meshCount", "expected": { "count": 1 } }
  ]
}
\`\`\`

Available checks: \`boundingBox\` (size/center), \`meshCount\`, \`vertexCount\`.
Each requirement should test one measurable property with appropriate tolerance.
</test_requirements>` : ''}

<code_standards>
${config.codeStandards}
</code_standards>

<error_handling>
On errors: analyze root cause, fix incrementally, preserve working geometry.
On test failures: review the failure reason and suggestion, then fix the specific issue.
Tool failures: stop after 1-2 retries and explain the issue to the user.

${config.languageName} patterns: ${config.commonErrorPatterns}
</error_handling>

<canonical_example>
${config.canonicalExample}
</canonical_example>

<research_capabilities>
Use \`${toolName.webSearch}\` for external information, then \`${toolName.webBrowser}\` for full page content if needed.
</research_capabilities>${modeSection}`;
}
