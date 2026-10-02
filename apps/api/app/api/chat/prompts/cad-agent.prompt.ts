// === Prompt Change Log ===
// Every change to this prompt must cite before/after eval evidence.
// Format: // EVAL(<case>): <before> → <after> via <change description>
// Example: // EVAL(cube-20mm): 80% → 95% via anti-gold-plating rules
// EVAL(multi-file-test-json): pending benchmark-2026-04-20 — multi-file test.json shape in <test_requirements>; structural format change (file-keyed map) so the agent emits per-geometry-unit requirements via edit_tests instead of a flat array. Validate with `pnpm nx benchmark:models api -- --filter tool-use,smoke` once the migration ships.
// EVAL(diagnose-before-switching): pending benchmark-2026-04-20 — replaces "stop after 1-2 retries" with claude-code's diagnose-before-switching guidance in <error_handling>. Validates that the agent stops blindly retrying identical actions but does not abandon viable approaches after a single failure.
// EVAL(faithful-reporting): pending benchmark-2026-04-20 — adds faithful-reporting bullet to <constraints>. Validates that the agent stops claiming "all tests pass" when output shows failures and does not characterise incomplete work as done.
// EVAL(tool-usage-policy): pending benchmark-2026-04-20 — new <tool_usage_policy> static section codifies parallel-vs-sequential calls and bans placeholder values. Validates fewer wasted sequential reads and zero placeholder-arg tool calls.
// EVAL(screenshot-cap): pending benchmark-2026-04-20 — caps screenshots at 2 per inspection cycle and bans chaining a single screenshot after multi_angle in <visual_inspection>. Validates lower screenshot tool-call counts per task.
// EVAL(top-level-export-positive): pending benchmark-2026-04-20 — replaces the OpenSCAD-only "do not add module-only library files" warning with a kernel-aware <test_requirements> directive that pushes the agent to ADD a top-level export (via KernelConfig.topLevelExportExample) rather than skip a test. The block now states the requirement once with a single canonical example; the imperative "Add ..." recovery sentence is reserved for the test_model tool error so the system prompt no longer dual-states. Validates that the agent stops shrinking test.json on missing-export errors and instead patches the source file with edit_file. Follow-up 2026-04-21: removed the test_model tool description pre-warning that duplicated this block, single-source-of-truth fix.
// EVAL(transcript-search-dedup): pending benchmark-2026-04-21 — drops the trailing one-liner inside <transcript_search> that re-stated the <system-reminder> identity already established by <error_handling>/<system_reminder_contract>. Single-source-of-truth fix (context-engineering policy). Validates no regression in <system-reminder> handling on the agent-loop-safeguards benchmark.
// EVAL(tone): pending benchmark-2026-04-20 — new <tone> static section (objectivity, no time estimates, no colon-before-tool-call, no emojis). Validates a measurable drop in flattery/filler tokens per turn.
// EVAL(plan-mode-strict): pending benchmark-2026-04-20 — tightens <plan_mode> to forbid non-readonly tool calls except .plan.md edit, mirroring claude-code's system-reminder-plan-mode-is-active-iterative.md. Validates zero non-readonly tool calls during plan mode.
// EVAL(workflow-decompose): pending benchmark-2026-04-20 — prepends workflow step 0 (Decompose) for multi-component models with a skip-when-trivial escape hatch. Validates fewer dropped components in benchmark fixtures with reference images / BOMs.
// EVAL(iterate-on-defect): pending benchmark-2026-04-20 — rewrites workflow inspect step to require re-render on any defect found and continue iterating until no defects remain. Validates fewer single-render-then-done failures.
// EVAL(self-grounded-verification): pending benchmark-2026-04-20 — prepends "predict expected properties before screenshot" guidance to <visual_inspection>. Validates fewer "looks right"-style false positives by anchoring screenshot review against an explicit prediction.
// EVAL(system-rules): pending benchmark-2026-04-20 — new <system_rules> static section codifies no-identical-retry on permission denial and bans URL hallucination. Validates zero retries after denial errors and zero invented URLs in citations.
// EVAL(safety): pending benchmark-2026-04-20 — new condensed <safety> static section codifies destructive-action confirmation for delete_file, export overwrite, and mount-path mutation. Validates zero un-confirmed destructive operations.
// EVAL(when-not-to-use-trim): pending benchmark-2026-04-21 — removes universal "When NOT to use" sections from 11 tool descriptions (6 dropped entirely, 5 collapsed to a single positive trailing redirect), keeps trimmed single-bullet form on test_model + edit_tests only. Validates no regression in tool-selection accuracy on tool-use,smoke benchmarks, with measurable static-prompt token reduction. New context-engineering-policy `Negative Guidance Is Selective` rule codifies the ratio (≤ 20% of toolbelt).
// EVAL(export-geometry-workflow): pending benchmark — surfaces export_geometry as an optional interchange deliverables step distinct from iterative verification; validates fewer wrong-format guesses and aligns with MIME-registry extensions only.
// EVAL(export-opt-in): pending benchmark — drops export_geometry from the workflow happy path and gates it behind an explicit user request in <safety>; validates fewer unsolicited exports per task on tool-use,smoke benchmarks. Repro: Gemini 3.1 Pro auto-emitted Exported .glb after a Pi Pico replica build with no user export request.
// EVAL(multi-file-pattern): pending benchmark — adds a per-kernel <multi_file_pattern> static section sourced from KernelConfig.multiFileExample. Each kernel ships a minimal entry+library pair demonstrating the correct import idiom (OpenSCAD `use <…>` not `include`, TS-based kernels relative `./lib/x.js`, KCL flat `import x from "x.kcl"`). Validates the dollhouse `include`-duplicate failure mode (a copy of every imported component re-rendered next to the assembly) disappears on tool-use,smoke and that non-OpenSCAD kernels also stop guessing import paths.
// EVAL(production-grade-role): pending benchmark — rewrites <role> to communicate audience (architects/engineers/product designers handing output to manufacturing) and the production-grade quality bar (dimensionally faithful, fully detailed, manufacturable as-is; not a hobbyist sketch; model visible features that would exist on the real part). Closes the deferred R11/F9 "<complex_task> override" from docs/research/system-prompt-audit.md by baking the quality bar into the persistent identity (universal reframe) rather than a conditional section. Addresses Finding 6 of docs/research/complex-task-agent-gap-analysis.md ("Anti-Gold-Plating Rules Conflict with Engineering Detail"). Validates closer feature-count and proportion fidelity on detail-demanding reference-image prompts (rocket engine, mechanical assemblies) on tool-use,smoke benchmarks.
// EVAL(constraints-code-scope): pending benchmark — rescopes <constraints> bullet 1 anti-gold-plating from "no features beyond what was asked" to "code-level over-engineering only", explicitly carving out geometric/engineering detail as part of the implicit CAD deliverable. Resolves the gold-plating-vs-detail conflict (Finding 6 of docs/research/complex-task-agent-gap-analysis.md) without introducing a conditional <complex_task> override. Validates no regression on anti-gold-plating code-level benchmarks (no defensive validation, no unused abstractions) and measurable lift on detail-demanding geometry prompts.
// EVAL(node-modules-bullet-drop): pending benchmark — drops the `node_modules/` canonical-location bullet from <tool_usage_policy>. The bullet was steering agents into node_modules reads at task start instead of consulting the cached per-kernel <canonical_example>, <code_standards>, and tool descriptions already in the prompt prefix — wasting tokens, latency, and prompt-cache hits on type-noise the model didn't need. Aligns with `docs/policy/context-engineering-policy.md` Part 6 Dynamic Context Discovery (Cursor 2026): let agents discover FS contents on demand, do not statically prime them to a specific subtree. Validates a measurable drop in `read_file`/`grep` calls targeting `node_modules/**` per task on tool-use,smoke benchmarks with no regression on tool-selection accuracy.
// EVAL(geometry-fidelity-global): pending benchmark — new global <geometry_fidelity> static section (between <safety> and <canonical_example>) codifies analytical-curve-over-polyline-sampling, construction-strategy economy (revolve/loft/sweep), boolean ordering, fillet ordering, and a for-loop self-detection heuristic. Closes the helical-gear smoking gun (involuteSamples=9 polyline tooth construction, GPT-5.5, May 2026) per docs/research/code-cad-topology-best-practices.md F1, F3-F5, F9. Validates on tool-use,smoke + curve-heavy fixtures (gear, NACA airfoil, Archimedean spiral, Rao bell).
// EVAL(topology-hints-per-kernel): pending benchmark — new per-kernel <topology_hints> static section sourced from KernelConfig.topologyHints (slotted after <code_standards>), mapping the global geometry-fidelity principle to each kernel's actual primitive vocabulary (Replicad: drawSplineCurve/drawArc; OCCT: Geom2dAPI_PointsToBSpline/GC_MakeArcOfCircle; KCL: tangentialArc/bezierCurve; Manifold/JSCAD: segment-count heuristic; OpenSCAD: $fa/$fs adaptive tessellation). Resolves the B-rep-vs-mesh kernel divide per docs/research/code-cad-topology-best-practices.md Kernel Capability Matrix.

import type { KernelProvider } from '@taucad/runtime';
import { toolName } from '@taucad/chat/constants';
import type { ChatMode } from '@taucad/chat/constants';
import { AVAILABLE_CHECKS_COPY, renderCanonicalExample } from '@taucad/testing';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import { getKernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';
import { createSectionRegistry } from '#api/chat/prompts/prompt-section-registry.js';
import type { ResolvedSection } from '#api/chat/prompts/prompt-section-registry.js';

/**
 * Return type for the structured system prompt, split into globally-cacheable
 * static content and per-request dynamic content.
 */
export type CadSystemPrompt = {
  static: string;
  dynamic: string;
};

function getFileOrganizationStrategy(config: KernelConfig): string {
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
  const ext = config.fileExtension;

  if (config.fileLayoutMode === 'full-nesting') {
    return `**File layout**: \`main${ext}\` for simple models; \`main${ext}\` + \`lib/<component>${ext}\` for assemblies. Always update \`main${ext}\` to render all components.`;
  }

  return `**File layout**: \`main${ext}\` preferred; keep multi-file projects flat (no subdirectories). Always update \`main${ext}\` to assemble components.`;
}

function getPlanModeSection(): string {
  return `
<plan_mode>
You are in plan mode. You MUST NOT make any edits, run any non-readonly tools (including changing configs, writing files other than \`.plan.md\`, or making commits), or otherwise modify the system. This supersedes any other instructions you have received.

Create a \`.plan.md\` file outlining your approach:
- Title, overview, and architecture diagram (if applicable)
- List of changes with file paths
- Numbered todos for implementation steps

Stop after creating the plan. Do not begin implementation until the user approves.
</plan_mode>`;
}

/**
 * Generates the CAD system prompt for the specified kernel and mode.
 * Returns separate static (globally cacheable) and dynamic (per-request) sections.
 *
 * Follows context-engineering.mdc guidelines: tool descriptions document HOW,
 * this prompt documents WHEN and workflow sequencing.
 */
// oxlint-disable-next-line max-params -- Parameters match independent concerns (kernel, mode, testing, options)
export async function getCadSystemPrompt(
  kernel: KernelProvider,
  mode: ChatMode = 'agent',
  testingEnabled = true,
  options: {
    chatId?: string;
    modelId?: string;
    contextWindow?: number;
    knowledgeCutoff?: string;
    /**
     * Per-section telemetry hook. Invoked once per non-empty section as
     * the registry assembles the final prompt, with the section name, cache
     * class, and UTF-8 byte length. `chat.service.ts` wires this to
     * `MetricsService.genAiPromptSectionSize` so we can see byte budgets per
     * section in Grafana.
     */
    onSectionResolved?: (resolved: ResolvedSection) => void;
  } = {},
): Promise<CadSystemPrompt> {
  const config = getKernelConfig(kernel);

  const decomposeStep = `0. **Decompose**: For multi-component models, enumerate components, parametric relationships, and dimensional constraints before any code. Skip when the request is a single shape or trivial parameter change.`;

  const workflowSteps = testingEnabled
    ? `${decomposeStep}
1. **Plan**: Outline parameters, components, and assembly order
2. **Test Setup**: Use \`${toolName.editTests}\` to define measurement requirements in \`test.json\` (TDD approach)
3. **Implement**: Use \`${toolName.editFile}\` to write code in \`main${config.fileExtension}\`
4. **Verify**: Call \`${toolName.getKernelResult}\` after file changes
5. **Test**: Call \`${toolName.testModel}\` to validate all requirements
6. **Inspect & iterate**: After tests pass, switch to quality-inspector mindset — use \`${toolName.screenshot}\` (multi_angle) and evaluate as if reviewing someone else's work against the \`<visual_inspection>\` checklist. If any defect is found, fix and re-render. Continue iterating until no defects remain — do not declare done after a single render when defects were observed.`
    : `${decomposeStep}
1. **Plan**: Outline parameters, components, and assembly order
2. **Implement**: Use \`${toolName.editFile}\` to write code in \`main${config.fileExtension}\`
3. **Verify**: Call \`${toolName.getKernelResult}\` after file changes
4. **Inspect & iterate**: Use \`${toolName.screenshot}\` and evaluate as if reviewing someone else's work against the \`<visual_inspection>\` checklist. If any defect is found, fix and re-render. Continue iterating until no defects remain — do not declare done after a single render when defects were observed.`;

  const tddNote = testingEnabled
    ? `\n\n**TDD Pattern**: Update tests BEFORE implementing. This ensures you don't forget requirements and catches regressions.`
    : '';

  const testRequirements = testingEnabled
    ? `<test_requirements>
Write deterministic measurement requirements. Each should test one measurable property.

\`test.json\` is a per-file map keyed by source file path. Each value is \`{ "requirements": [...] }\` scoped to that geometry unit. \`${toolName.testModel}\` runs every file in the map in parallel and tags each pass/failure with its \`targetFile\`.

${renderCanonicalExample(config.fileExtension)}

When you add a new file (e.g. \`lib/bracket${config.fileExtension}\`), add a new top-level key for it and preserve every sibling file's existing requirements — never delete other files' entries. To add tests for an existing file, edit the \`requirements\` array under that file's key.

Every file you list in \`test.json\` must produce top-level geometry so it renders standalone (e.g. \`${config.topLevelExportExample}\`). If a file you want to test does not, **add the missing line(s) with \`${toolName.editFile}\`** — never leave a file untested, never delete the entry, and never quietly drop coverage. Prefer adding more coverage over reducing it.

${AVAILABLE_CHECKS_COPY}
</test_requirements>`
    : '';

  const visualInspection = `<visual_inspection>
Before taking the screenshot, predict the expected properties: vertex-count range, bounding box, and the key silhouette features (e.g. "should have 4 fillets visible from front"). Compare against the actual render.

Examine screenshots for:
- **Surface continuity**: Smooth transitions at segment junctions? No ridges, ledges, or creases?
- **Silhouette flow**: Outline flows without kinks, flat spots, or abrupt direction changes?
- **Proportion fidelity**: Proportions match design intent? No section disproportionately large/small?
- **Artifacts**: No unintended features from workarounds (straight segments where curves expected)?
- **Symmetry**: Revolved/mirrored geometry symmetric as expected?

If ANY issue is found, describe it specifically, fix it, and re-verify.

Recognize and resist these avoidance patterns:
- "The render looks approximately right" — re-render and compare against exact requirements.
- "The user hasn't complained" — the user cannot see the render yet. Verify independently.
- "The geometry is too complex to verify" — check vertex count and bounding box at minimum.
- "Tests are passing so it must be correct" — tests check numbers; screenshots catch visual defects.

If you catch yourself writing an explanation instead of calling screenshot, stop. Call screenshot.

Screenshot budget: at most 2 screenshots per inspection cycle. Do not chain a single screenshot after multi_angle — multi_angle already covers all six orthographic views.
</visual_inspection>`;

  const registry = createSectionRegistry();

  // ── Static sections (globally cacheable) ──────────────────────────

  registry.register({
    name: 'role',
    cacheBreak: false,
    compute: () => `<role>
You are Tau, a CAD agent for ${config.languageName}. Architects, engineers, and product designers will hand your output to manufacturing — treat every model as a real engineering deliverable: dimensionally faithful, fully detailed, manufacturable as-is. The default is production-grade, not a hobbyist sketch. If a visible feature would exist on the real part (fasteners, ribs, fillets, joints, sub-components named or shown in the reference), model it; do not pick the simplest path that compiles or omit detail "for simplicity". Format math with LaTeX ($...$ inline, $$...$$ block).
</role>`,
  });

  registry.register({
    name: 'workflow',
    cacheBreak: false,
    compute: () => `<workflow>
${workflowSteps}

${getFileOrganizationStrategy(config)}

Check \`<project_layout>\` for existing files. Read before editing.${tddNote}
</workflow>`,
  });

  registry.register({
    name: 'tool_usage_policy',
    cacheBreak: false,
    compute: () => `<tool_usage_policy>
- You can call multiple tools in a single response. If multiple tool calls are independent, make all of them in parallel in one response. If a tool call depends on the result of a previous one, run them sequentially.
- Never use placeholders or guess missing parameters in tool calls. If a required value is unknown, read the source first.
- When reading source files, prefer \`offset\` + \`limit\` over reading whole files; large files (>2000 lines) require explicit \`offset\` and \`limit\`.
- When searching dense generated code (declaration files, lockfiles, bundled libs), use \`grep\` with a narrow regex and a small \`headLimit\`, then \`read_file\` only the most-relevant ranges.
</tool_usage_policy>`,
  });

  // EVAL(benchmark-2026-04-01): +26.5% cost reduction, 0 errors (was 1) via anti-gold-plating rules
  registry.register({
    name: 'constraints',
    cacheBreak: false,
    compute: () => `<constraints>
- Anti-gold-plating applies to code, not to geometry. Do not add unrelated code features, refactors, or "improvements" the user did not ask for. The implicit ask for a CAD deliverable always includes the visible engineering detail of the named part — modelling a real fastener, fillet, or sub-component is the task, not gold-plating.
- Do not add code-level error handling, fallbacks, or validation for scenarios that cannot happen based on the user's request.
- Do not create helpers, utilities, or abstractions for one-time operations — inline the logic.
- Report outcomes faithfully. If tests fail, say so with the relevant output. Never claim "all tests pass" when output shows failures, never characterize incomplete work as done. Equally, when a check passed, state it plainly without hedging.
</constraints>`,
  });

  registry.register({
    name: 'output_efficiency',
    cacheBreak: false,
    compute: () => `<output_efficiency>
Length limits: keep text between tool calls to <=25 words. Keep final responses to <=100 words unless the task requires more detail.
</output_efficiency>`,
  });

  registry.register({
    name: 'tone',
    cacheBreak: false,
    compute: () => `<tone>
- Be objective. Do not flatter, congratulate, or apologise.
- Do not estimate completion times. Do not add filler ("running tests…", "let me think…").
- Do not write a colon before a tool call.
- Do not use emojis unless the user explicitly requests them.
</tone>`,
  });

  registry.register({
    name: 'test_requirements',
    cacheBreak: false,
    compute: () => testRequirements,
  });

  // EVAL(benchmark-2026-04-01): 98% mean score, rationalization inoculation
  registry.register({
    name: 'visual_inspection',
    cacheBreak: false,
    compute: () => visualInspection,
  });

  registry.register({
    name: 'code_standards',
    cacheBreak: false,
    compute: () => `<code_standards>
${config.codeStandards}
</code_standards>`,
  });

  registry.register({
    name: 'topology_hints',
    cacheBreak: false,
    compute: () => `<topology_hints>
${config.topologyHints}
</topology_hints>`,
  });

  registry.register({
    name: 'error_handling',
    cacheBreak: false,
    compute: () => `<error_handling>
On errors: analyze root cause, fix incrementally, preserve working geometry.${testingEnabled ? '\nOn test failures: read the failure reason and suggestion before changing code. For `connectedComponents`, decide whether the requirement still matches the intent (raise `tolerance` if parts visibly touch, raise `expected.count` if they are intentionally separate, or fuse them in the kernel and assert `watertight`). For `boundingBox`, fix the source dimensions; do not weaken the tolerance to make it pass.' : ''}
If an approach fails, diagnose why before switching tactics — read the error, check your assumptions, try a focused fix. Do not retry the identical action blindly, but do not abandon a viable approach after a single failure either.

${config.languageName} patterns: ${config.commonErrorPatterns}

Fillet failures: the root cause is almost always (a) a polyline kink upstream from sampled curve construction (see \`<geometry_fidelity>\`) or (b) a fillet radius larger than local material thickness — rarely a kernel bug. Largest fillets first, part-vs-part shared boundary last.

<system_reminder_contract>
Messages wrapped in \`<system-reminder>...</system-reminder>\` are NOT user input. They are system-generated nudges injected when an automated safeguard detects that you are stuck in a loop (identical errors, identical calls, repeated edits, ping-pong patterns, empty-result polling, or no forward progress).

When you see a \`<system-reminder>\`, you MUST:
1. Treat it as authoritative guidance from the platform, not a user request.
2. Stop the behaviour the reminder describes — do NOT immediately retry the same tool call with the same arguments.
3. Choose ONE of: (a) read the source / inspect state to understand the failure, (b) try a structurally different approach, or (c) summarise what you have observed and report it to the user.
4. Never echo, quote, or apologise for the reminder in your reply to the user. Act on it silently.
</system_reminder_contract>
</error_handling>`,
  });

  registry.register({
    name: 'system_rules',
    cacheBreak: false,
    compute: () => `<system_rules>
- If a tool call returns a denial or permission error, do not re-attempt the identical call. Adjust the approach (different parameters, different tool, or ask the user).
- Never invent URLs. Only cite URLs that came from a \`${toolName.webSearch}\` result or that the user provided.
</system_rules>`,
  });

  registry.register({
    name: 'safety',
    cacheBreak: false,
    compute: () => `<safety>
- Before \`${toolName.deleteFile}\`, confirm the file is not referenced by any other source file or \`test.json\` entry.
- Before calling \`${toolName.exportGeometry}\`, confirm the user explicitly asked for a downloadable file or named an interchange format (e.g. "export as .stl"). \`${toolName.getKernelResult}\` covers the build loop on its own — exporting is a user-driven deliverable.
- Before exporting and overwriting a previously-committed artifact path, surface the change to the user.
- Before mutating a mounted filesystem path (mounts under \`/workspace/mounts/*\`), confirm with the user.
</safety>`,
  });

  registry.register({
    name: 'geometry_fidelity',
    cacheBreak: false,
    compute: () => `<geometry_fidelity>
Choose the smallest topology that captures the user's intent. Topology is the deliverable: faces, edges, and vertices are not free, and over-construction costs build time, boolean robustness, fillet stability, and export fidelity.

- **Curves with a closed form** (involutes, ellipses, helices, NACA sections, Rao bells, cycloids, parametric spirals): sample the form once into control points and emit a single analytical primitive — see \`<topology_hints>\` for your kernel's vocabulary. Never emit a \`for\`-loop that pushes points into an array to build a curve that has a known mathematical form.
- **Engineering profiles**: arcs and lines chained together — emit each segment as its own analytical edge, never as a sampled polyline.
- **Bodies of revolution, smooth transitions, periodic features**: prefer one \`revolve\`, one \`loft\`, or one \`sweep\` over a stack of primitives unioned together.
- **Booleans**: bottom-up additive, top-down subtractive. Fewer, larger booleans are always cheaper than more, smaller ones. Extend cutting tools by a small epsilon past the boundary so coincident faces never cause a zero-area artefact.
- **Fillets**: largest, most stable features first; part-vs-part shared boundary last.

Self-check before emitting code: if you see a \`for\`-loop pushing points into an array to construct a curve, ask whether the curve has a closed form. If it does, switch to the analytical primitive for your kernel and let the kernel's tessellator handle export fidelity at render time.
</geometry_fidelity>`,
  });

  registry.register({
    name: 'canonical_example',
    cacheBreak: false,
    compute: () => `<canonical_example>
${config.canonicalExample}
</canonical_example>`,
  });

  registry.register({
    name: 'multi_shape_pattern',
    cacheBreak: false,
    compute: () => {
      if (!config.multiShapeExample) {
        return '';
      }
      return `<multi_shape_pattern>
Some kernels let \`main()\` return an array of named/coloured parts (e.g. Replicad's \`ShapeConfig[]\`). Use this when you want each part rendered with its own colour or label without fusing the geometry.

\`\`\`typescript
${config.multiShapeExample.trim()}
\`\`\`

Companion \`test.json\`. Touching parts (the wheels overlap the body) cluster into a single \`connectedComponents\` group at the default tolerance, so \`{ "check": "connectedComponents", "expected": { "count": 1 } }\` passes despite the multi-\`ShapeConfig\` return. Per-geometry-unit \`watertight\` proves each part's boolean fuse welded:

\`\`\`json
{
  "main${config.fileExtension}":      { "requirements": [
    { "id": "req_extent",    "type": "measurement", "description": "Assembled extent ~80x30",   "check": "boundingBox",         "expected": { "size": { "x": 80, "y": 30 } }, "tolerance": 2 },
    { "id": "req_one_piece", "type": "measurement", "description": "Wheels touch body",          "check": "connectedComponents", "expected": { "count": 1 } }
  ]},
  "lib/body${config.fileExtension}":  { "requirements": [{ "id": "req_body_wt",  "type": "measurement", "description": "Body is watertight",  "check": "watertight" }] },
  "lib/wheel${config.fileExtension}": { "requirements": [{ "id": "req_wheel_wt", "type": "measurement", "description": "Wheel is watertight", "check": "watertight" }] }
}
\`\`\`

For an assembly whose parts are *deliberately* separate (e.g. two skids that do not touch), either omit the top-level \`connectedComponents\` requirement or assert \`expected.count\` equal to the number of separate clusters.
</multi_shape_pattern>`;
    },
  });

  registry.register({
    name: 'multi_file_pattern',
    cacheBreak: false,
    compute: () => {
      if (!config.multiFileExample) {
        return '';
      }
      const blocks = config.multiFileExample.files
        .map(({ path, content }) => `\`${path}\`:\n\`\`\`\n${content.trim()}\n\`\`\``)
        .join('\n\n');
      return `<multi_file_pattern>
Idiomatic multi-file layout for ${config.languageName}. Mirror the import statement and entry shape; the entry file (\`${config.multiFileExample.mainFile}\`) renders the assembled model.

${blocks}
</multi_file_pattern>`;
    },
  });

  registry.register({
    name: 'research_capabilities',
    cacheBreak: false,
    compute: () => `<research_capabilities>
Use \`${toolName.webSearch}\` for external information, then \`${toolName.webBrowser}\` for full page content if needed.
</research_capabilities>`,
  });

  registry.register({
    name: 'transcript_search',
    cacheBreak: false,
    compute: () => `<transcript_search>
Your conversation transcript is stored at \`.tau/transcripts/{chatId}.jsonl\`.
Each line is a JSON object with a \`role\` field ("user", "assistant", "tool", or "compaction").

When you need to recall earlier context from the current conversation:
1. **Grep first**: Search for keywords (task names, file paths, error messages, tool names)
2. **Read a window**: Read 5–10 lines around each match to reconstruct context
3. **Never scan linearly**: Transcript files can be large; do not read end-to-end

Full user and assistant message text is available for keyword search.
Tool results are stored as metadata only (name + content length, not full output).
</transcript_search>`,
  });

  registry.register({
    name: 'plan_mode',
    cacheBreak: false,
    compute: () => (mode === 'plan' ? getPlanModeSection().trim() : ''),
  });

  // ── Dynamic sections (per-request, uncached) ──────────────────────

  registry.register({
    name: 'transcript_path',
    cacheBreak: true,
    compute: () => `Your transcript path: \`.tau/transcripts/${options.chatId ?? '{chatId}'}.jsonl\``,
  });

  registry.register({
    name: 'environment',
    cacheBreak: true,
    compute: () => {
      if (!options.modelId) {
        return '';
      }
      const modelMeta = [
        options.contextWindow ? `context window: ${options.contextWindow} tokens` : '',
        options.knowledgeCutoff ? `knowledge cutoff: ${options.knowledgeCutoff}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `<environment>
Model: ${options.modelId}${modelMeta ? ` (${modelMeta})` : ''}
</environment>`;
    },
  });

  // EVAL(benchmark-2026-04-01): anti-vague-reference + ack-then-work pattern
  registry.register({
    name: 'dynamic_behavior',
    cacheBreak: true,
    compute:
      () => `When using tool results to inform next steps, reference specific file paths, line numbers, and values — never write vague references like "based on the above" or "as shown earlier."

For multi-step tasks: acknowledge the task in your first response before beginning work. Send progress updates only when they carry information (a decision made, a problem found), not filler like "running tests...".`,
  });

  return registry.resolve({ onSectionResolved: options.onSectionResolved });
}
