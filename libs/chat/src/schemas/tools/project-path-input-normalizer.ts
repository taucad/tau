import { toolName } from '#constants/tool.constants.js';
import { resolveRootedPath } from '@taucad/utils/path';

type ProjectPathInputNormalization = {
  readonly input: unknown;
  readonly changed: boolean;
  readonly healedKeys: readonly string[];
};

type ProjectPathOutputNormalization = ProjectPathInputNormalization;

const singlePathFields = new Map<string, 'targetFile' | 'path'>([
  [toolName.readFile, 'targetFile'],
  [toolName.editFile, 'targetFile'],
  [toolName.createFile, 'targetFile'],
  [toolName.deleteFile, 'targetFile'],
  [toolName.getKernelResult, 'targetFile'],
  [toolName.exportGeometry, 'targetFile'],
  [toolName.screenshot, 'targetFile'],
  [toolName.listDirectory, 'path'],
  [toolName.grep, 'path'],
  [toolName.globSearch, 'path'],
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const repairModelPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const candidate = value.startsWith('/') && !value.startsWith('//') ? value.slice(1) : value;
  try {
    const canonical = resolveRootedPath(candidate);
    return canonical === value ? undefined : canonical;
  } catch {
    return undefined;
  }
};

const repairPathField = (record: Record<string, unknown>, field: string): Record<string, unknown> | undefined => {
  const repaired = repairModelPath(record[field]);
  return repaired === undefined ? undefined : { ...record, [field]: repaired };
};

const repairPathRows = (value: unknown, field: string): { value: unknown; changed: boolean } => {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const rows = value.map((row) => {
    if (!isRecord(row)) {
      return row;
    }
    const repaired = repairPathField(row, field);
    changed ||= repaired !== undefined;
    return repaired ?? row;
  });
  return { value: changed ? rows : value, changed };
};

/**
 * Repairs project-path aliases emitted by models or retained in historical
 * messages. Direct tool schemas remain strict and accept only rooted paths.
 * @public
 */
export const normalizeProjectPathToolInputAliases = (name: string, input: unknown): ProjectPathInputNormalization => {
  if (!isRecord(input)) {
    return { input, changed: false, healedKeys: [] };
  }

  if (name === toolName.testModel && Array.isArray(input['files'])) {
    const files = input['files'];
    const nextFiles = files.map((value) => repairModelPath(value) ?? value);
    const changed = nextFiles.some((value, index) => value !== files[index]);
    return changed
      ? { input: { ...input, files: nextFiles }, changed: true, healedKeys: ['files'] }
      : { input, changed: false, healedKeys: [] };
  }

  const field = singlePathFields.get(name);
  if (!field || !Object.hasOwn(input, field)) {
    return { input, changed: false, healedKeys: [] };
  }

  const repaired = repairModelPath(input[field]);
  return repaired === undefined
    ? { input, changed: false, healedKeys: [] }
    : { input: { ...input, [field]: repaired }, changed: true, healedKeys: [field] };
};

/** Repairs historical project paths carried in path-bearing tool outputs. @public */
export const normalizeProjectPathToolOutputAliases = (
  name: string,
  output: unknown,
): ProjectPathOutputNormalization => {
  if (!isRecord(output)) {
    return { input: output, changed: false, healedKeys: [] };
  }

  if (name === toolName.listDirectory) {
    const repaired = repairPathField(output, 'path');
    return repaired
      ? { input: repaired, changed: true, healedKeys: ['path'] }
      : { input: output, changed: false, healedKeys: [] };
  }

  const rowFields =
    name === toolName.grep
      ? ([['matches', 'file']] as const)
      : name === toolName.globSearch
        ? ([
            ['files', ''],
            ['entries', 'path'],
          ] as const)
        : name === toolName.exportGeometry
          ? ([['files', 'artifactPath']] as const)
          : name === toolName.testModel
            ? ([
                ['failures', 'targetFile'],
                ['passes', 'targetFile'],
              ] as const)
            : [];

  let next = output;
  const healedKeys: string[] = [];
  for (const [collection, field] of rowFields) {
    if (field === '' && Array.isArray(next[collection])) {
      const values = next[collection];
      const repaired = values.map((value) => repairModelPath(value) ?? value);
      if (repaired.some((value, index) => value !== values[index])) {
        next = { ...next, [collection]: repaired };
        healedKeys.push(collection);
      }
      continue;
    }

    const repaired = repairPathRows(next[collection], field);
    if (repaired.changed) {
      next = { ...next, [collection]: repaired.value };
      healedKeys.push(collection);
    }
  }

  if (name === toolName.getKernelResult && Array.isArray(next['kernelIssues'])) {
    let changed = false;
    const kernelIssues = next['kernelIssues'].map((issue) => {
      if (!isRecord(issue) || !isRecord(issue['location'])) {
        return issue;
      }
      const location = repairPathField(issue['location'], 'fileName');
      changed ||= location !== undefined;
      return location ? { ...issue, location } : issue;
    });
    if (changed) {
      next = { ...next, kernelIssues };
      healedKeys.push('kernelIssues');
    }
  }

  return healedKeys.length > 0
    ? { input: next, changed: true, healedKeys }
    : { input: output, changed: false, healedKeys: [] };
};
