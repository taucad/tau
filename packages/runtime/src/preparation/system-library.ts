import type { PreparationState } from '#preparation/preparation-host.types.js';

const loaderPatterns: readonly RegExp[] = [
  // Glibc's loader and CPython's ImportError: "libGL.so.1: cannot open shared object file: No such file or directory".
  /(?<library>[\w.+-]+\.so(?:\.\d+)*): cannot open shared object file/u,
  // Musl's loader: "Error loading shared library libGL.so.1: No such file or directory".
  /Error loading shared library (?<library>[\w.+-]+\.so(?:\.\d+)*)/u,
  // Dyld, for a library the OS should provide; an @rpath library missing from a closure is a packaging bug instead.
  /Library not loaded: (?<library>\/(?:usr\/lib|System\/Library)\/\S+)/u,
];

// Where a reader finds the library on the distributions Tau's Docker image and CI use.
const packageHints: Readonly<Record<string, string>> = {
  'libGL.so.1': 'libgl1 on Debian and Ubuntu, mesa-libGL on Fedora and RHEL',
  'libX11.so.6': 'libx11-6 on Debian and Ubuntu, libX11 on Fedora and RHEL',
};

/**
 * Recognise a dynamic loader's report of a host system library that is missing, such as the `libGL.so.1` the OCP
 * wheel links against on Linux.
 * @param output - A worker's stderr or an import error message.
 * @returns The library, or `undefined` when the text reports no missing system library.
 * @public
 */
export const missingSystemLibrary = (output: string): string | undefined => {
  for (const pattern of loaderPatterns) {
    const library = pattern.exec(output)?.groups?.['library'];
    if (library !== undefined) {
      return library;
    }
  }
  return undefined;
};

/**
 * The typed refusal for a kernel whose sealed closure cannot load because the host lacks a system library: `blocked`
 * with reason `missing-system-library` and `detail.library`, never a crash. Preparation cannot fix it; the person
 * installs the library.
 * @param input - The declaring package, the worker's output and the attempt it belongs to.
 * @returns The refusal, or `undefined` when the output reports no missing system library.
 * @public
 */
export const systemLibraryRefusal = (input: {
  readonly package: string;
  readonly output: string;
  readonly attemptId: string;
}): Extract<PreparationState, { status: 'blocked' }> | undefined => {
  const library = missingSystemLibrary(input.output);
  if (library === undefined) {
    return undefined;
  }
  const hint = packageHints[library];
  return {
    status: 'blocked',
    attemptId: input.attemptId,
    reason: 'missing-system-library',
    message: `${input.package} needs the system library ${library}, which this machine does not have. Install it${hint === undefined ? '' : ` (${hint})`}, then try again.`,
    detail: { library },
  };
};
