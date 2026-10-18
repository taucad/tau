import type { KernelIssue } from '@taucad/runtime/kernel';

/** The manifest a Build123d project declares its libraries in (D35). */
export const pyprojectPath = 'pyproject.toml';

/**
 * The libraries a Build123d project pins in `pyproject.toml`, at the versions this kernel runs: the CAD pins of
 * `python/requirements.in`. A test keeps them equal to that file and to the project template.
 */
export const build123dProjectLibraries: Readonly<Record<string, string>> = {
  build123d: '0.13.0',
  'cadquery-ocp-novtk': '8.0.1.0.0',
};

const projectLibraries = new Map(Object.entries(build123dProjectLibraries));

/** PEP 503 normalized distribution name. */
const normalize = (name: string): string => name.toLowerCase().replaceAll(/[-_.]+/gu, '-');

/** A quoted PEP 508 requirement pinned with `==` or `===`: name, optional extras, version. */
const pinPattern = /(["'])\s*([\w.-]+)\s*(?:\[[^\]]*\]\s*)?={2,3}\s*([^\s"',;]+)(?:(?!\1)[^\n])*\1/gu;

/**
 * Warn about every `[project] dependencies` pin in `pyproject.toml` that names one of this kernel's libraries at a
 * version the kernel does not run. An unpinned or ranged requirement is not a mismatch.
 * @param text - The project's `pyproject.toml`.
 * @returns One `LIBRARY_VERSION_MISMATCH` warning per mismatched pin, located at the pin.
 */
export const libraryVersionMismatches = (text: string): KernelIssue[] => {
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
  const issues: KernelIssue[] = [];
  for (const pin of dependencies[0].matchAll(pinPattern)) {
    // Both groups always participate in a match.
    const library = normalize(String(pin[2]));
    const declared = String(pin[3]);
    const runs = projectLibraries.get(library);
    if (runs === undefined || declared === runs) {
      continue;
    }
    issues.push({
      message: `${pyprojectPath} pins ${library}==${declared}, but the build123d kernel runs ${library} ${runs}. Pin "${library}==${runs}" in [project] dependencies so the project runs the same library inside and outside Tau.`,
      code: 'LIBRARY_VERSION_MISMATCH',
      type: 'kernel',
      severity: 'warning',
      location: {
        fileName: pyprojectPath,
        startLineNumber: text.slice(0, bodyStart + dependencies.index + pin.index).split('\n').length,
        startColumn: 1,
      },
      details: { producer: { kernelId: 'build123d' }, manifest: pyprojectPath, library, declared, runs },
    });
  }
  return issues;
};
