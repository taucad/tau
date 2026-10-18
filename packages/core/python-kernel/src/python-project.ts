import type { KernelIssue } from '@taucad/runtime/kernel';

/**
 * The manifest a Python kernel's project declares its libraries in (D35).
 * @public
 */
export const pyprojectPath = 'pyproject.toml';

/**
 * Normalize a distribution name as PEP 503 does.
 * @param name - A distribution name as a requirement spells it, such as `Cadquery_OCP`.
 * @returns The lower-case, dash-separated name, such as `cadquery-ocp`.
 */
const normalize = (name: string): string => name.toLowerCase().replaceAll(/[-_.]+/gu, '-');

/** A quoted PEP 508 requirement pinned with `==` or `===`: name, optional extras, version. */
const pinPattern = /(["'])\s*([\w.-]+)\s*(?:\[[^\]]*\]\s*)?={2,3}\s*([^\s"',;]+)(?:(?!\1)[^\n])*\1/gu;

/**
 * Warn about every `[project] dependencies` pin in `pyproject.toml` that names one of the kernel's libraries at a
 * version the kernel does not run. An unpinned or ranged requirement is not a mismatch.
 *
 * @param text - The project's `pyproject.toml`.
 * @param kernel - The kernel id, and the libraries it runs as `name → version` with PEP 503 normalized names.
 * @returns One `LIBRARY_VERSION_MISMATCH` warning per mismatched pin, located at the pin.
 * @public
 */
export const pythonLibraryVersionMismatches = (
  text: string,
  kernel: { readonly kernelId: string; readonly libraries: Readonly<Record<string, string>> },
): KernelIssue[] => {
  const table = /^\[project\][^\S\n]*$/mu.exec(text);
  if (!table) {
    return [];
  }
  const bodyStart = table.index + table[0].length;
  const rest = text.slice(bodyStart);
  const bodyEnd = rest.search(/^\[/mu);
  const dependencies = /^dependencies\s*=\s*\[(?:"[^"\n]*"|'[^'\n]*'|#[^\n]*|[^\]"'#])*\]/mu.exec(
    bodyEnd === -1 ? rest : rest.slice(0, bodyEnd),
  );
  if (!dependencies) {
    return [];
  }
  const libraries = new Map(Object.entries(kernel.libraries));
  const issues: KernelIssue[] = [];
  for (const pin of dependencies[0].matchAll(pinPattern)) {
    // Both groups always participate in a match.
    const library = normalize(String(pin[2]));
    const declared = String(pin[3]);
    const runs = libraries.get(library);
    if (runs === undefined || declared === runs) {
      continue;
    }
    issues.push({
      message: `${pyprojectPath} pins ${library}==${declared}, but the ${kernel.kernelId} kernel runs ${library} ${runs}. Pin "${library}==${runs}" in [project] dependencies so the project runs the same library inside and outside Tau.`,
      code: 'LIBRARY_VERSION_MISMATCH',
      type: 'kernel',
      severity: 'warning',
      location: {
        fileName: pyprojectPath,
        startLineNumber: text.slice(0, bodyStart + dependencies.index + pin.index).split('\n').length,
        startColumn: 1,
      },
      details: { producer: { kernelId: kernel.kernelId }, manifest: pyprojectPath, library, declared, runs },
    });
  }
  return issues;
};
