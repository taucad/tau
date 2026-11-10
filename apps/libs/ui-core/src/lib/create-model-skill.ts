import { kernelConfigurations } from '@taucad/types/constants';

const selectionGuidanceRows = kernelConfigurations
  .map(
    ({ id, name, language, mainFile, description, features, recommended }) =>
      `| \`cad-${id}\` | ${name} | \`${language}\` | \`${mainFile}\` | ${description}; ${features.join(', ')} | ${recommended} |`,
  )
  .join('\n');

export const createModelSkillMarkdown = `---
name: create-model
description: Selects a Tau CAD kernel and activates its authoring skill. Use when creating a model without a pinned kernel.
source: system
version: 1.0.0
when_to_use: Use when creating a CAD model without a pinned kernel or when kernel choice is ambiguous.
enabled: true
---

# Create Model

Choose the kernel whose row best matches the user's hard requirements. Do not choose by familiarity.

| Kernel skill | Kernel | Language | Main file | Strengths | Characteristic use cases |
| --- | --- | --- | --- | --- | --- |
${selectionGuidanceRows}

## Workflow

1. Choose exactly one kernel from the table.
2. Activate its authoring skill next with \`use_skill({ skillName: "cad-<kernel-id>" })\`.
3. Follow that skill and write the listed main file. For TypeScript kernels, the package import specified by the authoring skill binds the runtime kernel; for OpenSCAD and KCL, the main-file language binds it.

The file content is the kernel selection. Do not call or invent a kernel-selection tool.
`;
