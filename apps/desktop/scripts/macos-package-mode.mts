export type MacosPackageMode = { readonly release: boolean; readonly unsigned: boolean; readonly zip: boolean };

const flags = new Set(['--release', '--unsigned', '--zip']);

export const parseMacosPackageMode = (arguments_: readonly string[]): MacosPackageMode => {
  if (arguments_.some((argument) => !flags.has(argument))) {
    throw new TypeError('Usage: <script> [--release | --unsigned] [--zip]');
  }
  const release = arguments_.includes('--release');
  const unsigned = arguments_.includes('--unsigned');
  if (release && unsigned) {
    throw new TypeError('--release and --unsigned cannot be used together');
  }
  // The distribution archive is release output; any other mode writes it only on request.
  return { release, unsigned, zip: release || arguments_.includes('--zip') };
};
