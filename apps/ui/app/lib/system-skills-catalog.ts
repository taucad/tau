/**
 * This app's system-skill layer: every package-owned bundle, loaded the one way
 * that works in both a browser and Node.
 *
 * Package skills come from `@taucad/skills/resources`, the same generated
 * registry used by native desktop. App-only skills remain inline below.
 *
 * Only the T1 bodies come inline. `api-index.md` and the API shards stay files
 * inside each package, fetched when something greps them — the point of the
 * tiering is that the whole corpus is *reachable*, not that it is resident.
 *
 * The rows are no longer duplicated here either: name, description, version and
 * when-to-use are read off each manifest, so a package that re-renders its
 * bundle cannot disagree with the catalogue advertising it.
 *
 * @module
 */

import { systemSkillBundles } from '@taucad/skills/resources';

export type SystemSkill = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly source: 'system';
  readonly priority: 60;
  readonly whenToUse: string;
  readonly skillMarkdown: string;
  readonly fingerprint?: string;
  readonly files?: ReadonlyArray<{ readonly path: string }>;
};

/** Every package-owned bundle, flattened: one package may ship more than one. */
const packageSkills: readonly SystemSkill[] = systemSkillBundles.map(
  (bundle): SystemSkill => ({
    slug: bundle.slug,
    name: bundle.name,
    description: bundle.description,
    version: bundle.version,
    source: 'system',
    priority: 60,
    whenToUse: bundle.whenToUse,
    skillMarkdown: bundle.body,
    fingerprint: bundle.fingerprint,
    files: bundle.files,
  }),
);

export const systemSkillsCatalog: readonly SystemSkill[] = [
  {
    slug: 'create-skill',
    name: 'Create Skill',
    description: 'Create or update Tau agent skills',
    version: '1.1.0',
    source: 'system',
    priority: 60,
    whenToUse: 'Use when creating, updating, reviewing, or explaining Tau agent skills or SKILL.md structure.',
    skillMarkdown: `---
name: create-skill
description: Create or update Tau agent skills. Use when creating, updating, reviewing, or explaining Tau agent skills or SKILL.md structure.
metadata:
  version: "1.1.0"
---

# Create Skill

Use this skill to create or update Tau agent skills that teach the agent a specialized workflow, domain, or tool integration.

## Tau storage model

- Tau skills follow the Agent Skills specification (agentskills.io), so a skill written here works in any agent that reads it.
- Project skills live at \`.agents/skills/<skill-name>/SKILL.md\`, the directory other agents read too.
- Installed and system skills can be shadowed by a project skill with the same name in \`.agents/skills\`.
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
|-- scripts/
|   \`-- helper.sh
\`-- assets/
    \`-- template.md
\`\`\`

Keep optional resources only when they directly support the skill. Avoid README, changelog, installation guide, and other auxiliary files.

## Frontmatter

\`SKILL.md\` starts with YAML frontmatter. Two fields are required:

\`\`\`markdown
---
name: skill-name
description: What the skill does and when to use it, in the third person, with the words a matching request would use.
---
\`\`\`

Rules:

- \`name\`: 1-64 characters; lowercase letters, digits, and hyphens only; no leading, trailing, or consecutive hyphens. It must equal the directory name.
- \`description\`: 1-1024 characters. Say both what the skill does and when to use it; it is the only text the agent sees before activating the skill.
- Prefer short verb-led names such as \`create-policy\`, \`review-pr\`, or \`design-for-sheet-metal\`.

Optional fields, and no others at the top level:

- \`license\`: a licence name, or the name of a bundled licence file.
- \`compatibility\`: up to 500 characters, only when the skill needs a particular product, system package, or network access.
- \`metadata\`: a map of string keys to string values for anything else.
- \`allowed-tools\`: a space-separated list of pre-approved tools (experimental; support varies by agent).

\`\`\`markdown
---
name: skill-name
description: What the skill does and when to use it.
license: MIT
metadata:
  version: "1.0.0"
---
\`\`\`

Tau reads two \`metadata\` keys: \`version\` is shown beside the skill, and \`enabled: "false"\` keeps the skill out of the catalog without deleting it.

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
  ...packageSkills,
];
