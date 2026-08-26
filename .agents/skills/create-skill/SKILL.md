---
name: create-skill
description: >-
  Create project or personal agent skills. Use when authoring a new skill,
  adapting skill instructions, or asking about SKILL.md structure.
---

# Creating Agent Skills

This skill guides the creation of effective agent skills. Skills are markdown files that teach an agent how to perform a specific workflow: reviewing PRs using team standards, generating commit messages in a preferred format, querying database schemas, converting references, or any specialized repeatable task.

## Before You Begin

Gather the minimum useful requirements:

1. **Purpose and scope**: What exact task or workflow should the skill help with?
2. **Target location**: Should this be a personal skill (`~/.agents/skills/`) or project skill (`.agents/skills/`)?
3. **Trigger scenarios**: When should the agent apply this skill?
4. **Key domain knowledge**: What specialized information does the agent need that it would not already know?
5. **Output format preferences**: Are specific templates, formats, or styles required?
6. **Existing patterns**: Are there examples or conventions to follow?

### Verbatim Text From The User

If the user includes exact wording to use in the skill, respect it and use it **verbatim** in `SKILL.md`: same words, same order. Do not paraphrase, soften, expand, or add unrequested headings around the quoted text.

### Infer From Context

If the conversation already establishes the workflow, infer the skill from that context. Create skills from recurring workflows, durable patterns, or domain knowledge that should be reusable.

### Ask Only When Needed

If important information is missing and a reasonable default would be risky, ask concise questions. Use structured question tools when available; otherwise ask conversationally.

---

## Skill File Structure

### Directory Layout

Skills are directories containing a required `SKILL.md` file and optional supporting files:

```text
skill-name/
├── SKILL.md              # Required - main instructions
├── reference.md          # Optional - detailed documentation
├── examples.md           # Optional - usage examples
└── scripts/              # Optional - skill-specific utilities
    ├── validate.py
    └── helper.sh
```

Keep references one level deep. Link directly from `SKILL.md` to supporting files so the agent can load only what it needs.

### Storage Locations

| Type     | Path                     | Scope                             |
| -------- | ------------------------ | --------------------------------- |
| Personal | `~/.agents/skills/name/` | Available across local projects   |
| Project  | `.agents/skills/name/`   | Shared with anyone using the repo |

For Tau project skills, use `.agents/skills/<skill-name>/`.

### SKILL.md Structure

Every skill needs YAML frontmatter and a markdown body:

```markdown
---
name: your-skill-name
description: Specific third-person description of what the skill does and when to use it.
disable-model-invocation: true
---

# Your Skill Name

## Instructions

Clear, step-by-step guidance for the agent.

## Examples

Concrete examples when they improve output quality.
```

Use `disable-model-invocation: true` when the skill should load only when named explicitly. Omit it when ambient context should trigger the skill automatically.

### Required Metadata

| Field         | Requirements                                         | Purpose                        |
| ------------- | ---------------------------------------------------- | ------------------------------ |
| `name`        | Max 64 chars, lowercase letters/numbers/hyphens only | Unique skill identifier        |
| `description` | Max 1024 chars, non-empty                            | Skill discovery and triggering |

---

## Writing Effective Descriptions

The description is critical for discovery. It should be specific, third-person, and include both what the skill does and when to use it.

Good:

```yaml
description: Convert reference PDFs into Markdown files under docs/reference/. Use when adding papers, PDFs, or source documents to the project reference corpus.
```

Avoid:

```yaml
description: Helps with documents.
```

Description checklist:

- Write in third person.
- Include trigger terms users are likely to mention.
- State the workflow's output or destination.
- Avoid "I can..." or "You can..." phrasing.

---

## Core Authoring Principles

### 1. Be Concise

The context window is shared with conversation history, other skills, and the user request. Add only information the agent needs.

Challenge each paragraph:

- Does this change the agent's behavior?
- Can the agent infer this from general knowledge?
- Would a command, template, or checklist be cheaper?

Good:

```markdown
## Extract PDF text

Use `pnpm nx run scripts:pdf-to-md -- docs/reference/paper.pdf`.
```

Avoid:

```markdown
## Extract PDF text

PDF files are a common document format. There are many libraries available for PDF processing...
```

### 2. Keep SKILL.md Under 500 Lines

Put essential workflow instructions in `SKILL.md`. Move detailed API notes, examples, or schemas into one-hop supporting files.

### 3. Choose The Right Degree Of Freedom

| Freedom level | Use when                                  | Example                 |
| ------------- | ----------------------------------------- | ----------------------- |
| High          | Many valid approaches exist               | Code review guidelines  |
| Medium        | A preferred pattern has room for judgment | Research doc templates  |
| Low           | Consistency and safety are critical       | Migration/runbook steps |

---

## Common Patterns

### Template Pattern

Use templates when output shape matters:

```markdown
# [Analysis Title]

## Executive Summary

[One-paragraph overview]

## Findings

- Finding with supporting evidence

## Recommendations

1. Specific actionable recommendation
```

### Examples Pattern

Use examples when output quality depends on seeing the target style:

```text
Input: Fixed incorrect date display.

Output:
fix(reports): correct timezone date formatting

Use UTC timestamps consistently across generated reports.
```

### Workflow Pattern

Break complex operations into explicit steps:

```markdown
## Workflow

1. Inspect inputs.
2. Run the canonical script.
3. Validate output.
4. Remove temporary artifacts.
5. Summarize changed files and commands.
```

### Conditional Workflow Pattern

Use decision points when the right path depends on input state:

```markdown
## Input Handling

1. Local file? Copy or convert it directly.
2. Remote URL? Download it first.
3. Scanned PDF? Stop and report OCR is required unless OCR tooling exists.
```

### Feedback Loop Pattern

For quality-critical tasks, require validation:

```markdown
1. Make the change.
2. Run validation immediately.
3. Fix failures.
4. Re-run validation before finalizing.
```

---

## Utility Scripts

Prefer existing scripts over generated ad hoc code when consistency matters. Make clear whether the agent should execute the script or read it as reference.

```bash
pnpm nx run scripts:pdf-to-md -- docs/reference/paper.pdf
```

When adding new scripts, put them in the right project location, document required packages, and include explicit error handling.

---

## Anti-Patterns To Avoid

### Windows-Style Paths

- Use `scripts/helper.py`.
- Avoid `scripts\helper.py`.

### Too Many Options

Prefer one default with an escape hatch:

```markdown
Use the project PDF converter. For scanned PDFs requiring OCR, stop and report that OCR is required unless OCR tooling exists.
```

### Time-Sensitive Rules

Avoid date-bound instructions that silently expire. Use "current method" and "deprecated patterns" sections instead.

### Inconsistent Terminology

Choose one term and use it throughout, such as "reference document" rather than alternating between "paper", "source", "artifact", and "document" without distinction.

### Vague Names

- Good: `create-reference`, `audit-ui`, `package-release`
- Avoid: `helper`, `utils`, `tools`

---

## Skill Creation Workflow

### Phase 1: Discovery

Gather:

1. Primary use case
2. Storage location
3. Trigger scenarios
4. Requirements and constraints
5. Existing examples or patterns

### Phase 2: Design

1. Draft a lowercase hyphenated name.
2. Write a specific third-person description.
3. Outline only the sections needed.
4. Decide whether supporting files or scripts are necessary.

### Phase 3: Implementation

1. Create `.agents/skills/<skill-name>/`.
2. Write `SKILL.md` with valid frontmatter.
3. Add supporting files only when they reduce main-file complexity.
4. Add scripts only when they make the workflow safer or more repeatable.

### Phase 4: Verification

1. Confirm `SKILL.md` is under 500 lines.
2. Check the description includes what and when.
3. Check terminology is consistent.
4. Verify file references are one level deep.
5. Search for forbidden or obsolete path references.

---

## Complete Example

```text
code-review/
├── SKILL.md
├── STANDARDS.md
└── examples.md
```

```markdown
---
name: code-review
description: Review code for quality, security, and maintainability following team standards. Use when reviewing pull requests, examining code changes, or when the user asks for a code review.
---

# Code Review

## Quick Start

When reviewing code:

1. Check correctness and potential bugs.
2. Verify security practices.
3. Assess readability and maintainability.
4. Ensure tests cover the change.

## Feedback Format

- Critical: Must fix before merge.
- Suggestion: Consider improving.
- Optional: Nice to have.

## Additional Resources

- For detailed coding standards, see [STANDARDS.md](STANDARDS.md).
- For example reviews, see [examples.md](examples.md).
```

---

## Summary Checklist

- [ ] Description is specific and includes trigger terms.
- [ ] Description includes both what and when.
- [ ] Description is written in third person.
- [ ] `SKILL.md` is under 500 lines.
- [ ] Terminology is consistent.
- [ ] Examples are concrete when included.
- [ ] Supporting file references are one level deep.
- [ ] Workflows have clear steps.
- [ ] Scripts, when present, solve the repeatable problem directly.
- [ ] Required packages and validation commands are documented.
