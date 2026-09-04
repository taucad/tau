export type BuiltInSystemSkill = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly source: 'system';
  readonly whenToUse: string;
  readonly skillMarkdown: string;
};

export const builtInSystemSkills: readonly BuiltInSystemSkill[] = [
  {
    slug: 'create-skill',
    name: 'Create Skill',
    description: 'Create or update Tau agent skills',
    version: '1.0.0',
    source: 'system',
    whenToUse: 'Use when creating, updating, reviewing, or explaining Tau agent skills or SKILL.md structure.',
    skillMarkdown: `---
name: create-skill
description: Create or update Tau agent skills. Use when creating, updating, reviewing, or explaining Tau agent skills or SKILL.md structure.
source: system
version: 1.0.0
when_to_use: Use when creating, updating, reviewing, or explaining Tau agent skills or SKILL.md structure.
enabled: true
---

# Create Skill

Use this skill to create or update Tau agent skills that teach the agent a specialized workflow, domain, or tool integration.

## Tau storage model

- Canonical workspace skills live at \`.agents/skills/<skill-name>/SKILL.md\`.
- Installed and built-in skills can be shadowed by a user-authored skill with the same name in \`.agents/skills\`.
- Before applying an existing skill, the agent should call \`use_skill({ skillName: "<name>" })\` so skill usage is visible.

## Discovery

Before writing files, gather or infer:

1. Purpose and scope: the exact task or workflow the skill supports.
2. Trigger scenarios: the user phrases or contexts that should activate it.
3. Domain knowledge: the non-generic facts, conventions, or procedures the model needs.
4. Output expectations: templates, file formats, validation loops, or response style.
5. Existing examples: nearby skills, team conventions, or user-provided wording.

If the user provides exact wording for the skill, preserve it verbatim.

## Structure

Every skill is a directory with a required \`SKILL.md\`:

\`\`\`text
skill-name/
|-- SKILL.md
|-- references/
|   \`-- detailed-topic.md
\`-- scripts/
    \`-- helper.sh
\`\`\`

Keep optional resources only when they directly support the skill. Avoid README, changelog, installation guide, and other auxiliary files.

## Frontmatter

Use flat YAML frontmatter:

\`\`\`markdown
---
name: skill-name
description: Specific third-person description. Include what the skill does and when to use it.
source: user
version: 1.0.0
when_to_use: Use when the user asks for the target workflow or domain.
enabled: true
---
\`\`\`

Rules:

- \`name\`: lowercase letters, digits, and hyphens only; max 64 characters.
- \`description\`: third person, concrete, non-empty, and trigger-rich.
- Prefer short verb-led names such as \`create-policy\`, \`review-pr\`, or \`design-for-sheet-metal\`.

## Writing guidance

- Keep \`SKILL.md\` under 500 lines.
- Assume the model is capable; include only knowledge or workflow it would not already know.
- Use progressive disclosure: put essential steps in \`SKILL.md\`, and link one-level-deep reference files for detail.
- Use scripts when deterministic behavior matters or the same code would otherwise be regenerated repeatedly.
- Use POSIX-style paths such as \`scripts/validate.sh\`, not Windows-style paths.
- Choose one term for each concept and use it consistently.
- Avoid time-sensitive instructions; use "Current method" and "Deprecated patterns" sections instead.

## Workflow

1. Draft the skill name and trigger-rich description.
2. Decide whether the root \`SKILL.md\` is enough or whether references/scripts are justified.
3. Create or update \`.agents/skills/<skill-name>/SKILL.md\`.
4. Add optional \`references/\` or \`scripts/\` only when they reduce real complexity.
5. Verify the frontmatter parses, the body is concise, and every referenced file exists.

## Useful patterns

Template pattern:

\`\`\`markdown
## Output format

Use this structure:

# [Title]

## Summary
[One paragraph]

## Findings
- Finding with evidence

## Next steps
1. Actionable step
\`\`\`

Validation loop:

\`\`\`markdown
1. Make the change.
2. Run the named validation.
3. If validation fails, fix the cause and rerun.
4. Report only checks that actually ran.
\`\`\`

Conditional workflow:

\`\`\`markdown
If creating a new artifact, follow the creation workflow.
If updating an existing artifact, inspect the current file first and preserve user-authored content.
\`\`\`

## Verification checklist

- The skill name is valid and folder name matches it exactly.
- The description includes both what the skill does and when to use it.
- \`SKILL.md\` is concise and under 500 lines.
- References are one level deep and linked from \`SKILL.md\`.
- Scripts have clear invocation instructions and explicit error behavior.
- The skill is discoverable through Tau's skill catalog and can be activated with \`use_skill\`.
`,
  },
  {
    slug: 'create-model',
    name: 'Create Model',
    description:
      'Selects a Tau CAD kernel and activates its authoring skill. Use when creating a model without a pinned kernel.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use when creating a CAD model without a pinned kernel or when kernel choice is ambiguous.',
    skillMarkdown: createModelSkillMarkdown,
  },
  {
    slug: 'cad-build123d',
    name: 'Build123d Authoring',
    description:
      'Guides native Build123d BRep authoring in main.py. Use when creating or editing trusted Python CAD projects in Tau Desktop.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for Build123d source, .py CAD files, or a Build123d-pinned desktop project.',
    skillMarkdown: build123dSkillMarkdown,
  },
  {
    slug: 'cad-picogk',
    name: 'PicoGK Authoring',
    description:
      'Guides trusted PicoGK C# voxel authoring in main.cs. Use when creating or editing PicoGK projects in Tau Desktop.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for PicoGK source, .cs CAD files, or a PicoGK-pinned desktop project.',
    skillMarkdown: picogkSkillMarkdown,
  },
  {
    slug: 'cad-openscad',
    name: 'OpenSCAD Authoring',
    description:
      'Guides OpenSCAD model authoring in main.scad with idiomatic CSG and adaptive tessellation. Use when creating or editing .scad geometry.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for OpenSCAD source, .scad files, or an OpenSCAD-pinned project.',
    skillMarkdown: openscadSkillMarkdown,
  },
  {
    slug: 'cad-replicad',
    name: 'Replicad Authoring',
    description:
      'Guides precise Replicad BRep authoring in main.ts. Use when creating or editing TypeScript geometry imported from replicad.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for Replicad source, replicad imports, or a Replicad-pinned project.',
    skillMarkdown: replicadSkillMarkdown,
  },
  {
    slug: 'cad-manifold',
    name: 'Manifold Authoring',
    description:
      'Guides robust Manifold mesh CAD in main.ts. Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for Manifold source, manifold-3d imports, or a Manifold-pinned project.',
    skillMarkdown: manifoldSkillMarkdown,
  },
  {
    slug: 'cad-zoo',
    name: 'Zoo KCL Authoring',
    description:
      'Guides Zoo KCL modeling in main.kcl with pipe-based analytical geometry. Use when creating or editing KCL models.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for KCL source, .kcl files, or a Zoo-pinned project.',
    skillMarkdown: zooSkillMarkdown,
  },
  {
    slug: 'cad-jscad',
    name: 'JSCAD Authoring',
    description:
      'Guides JSCAD modeling in main.ts with 2D-first CSG and deliberate tessellation. Use when creating or editing @jscad/modeling geometry.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for JSCAD source, @jscad/modeling imports, or a JSCAD-pinned project.',
    skillMarkdown: jscadSkillMarkdown,
  },
  {
    slug: 'cad-opencascadejs',
    name: 'OpenCascade.js Authoring',
    description:
      'Guides direct OpenCascade.js BRep authoring in main.ts. Use when creating or editing libcascade geometry.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use for direct OpenCascade.js source, libcascade imports, or an OpenCascade-pinned project.',
    skillMarkdown: opencascadejsSkillMarkdown,
  },
  {
    slug: 'geospec-authoring',
    name: 'GeoSpec Authoring',
    description:
      'Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.',
    version: '1.0.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use before creating, extending, or repairing any GeoSpec geometry test.',
    skillMarkdown: geospecAuthoringSkillMarkdown,
  },
];
