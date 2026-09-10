export type MacosPackageMode = { readonly release: boolean; readonly unsigned: boolean };

export const parseMacosPackageMode = (arguments_: readonly string[]): MacosPackageMode => {
  if (arguments_.some((argument) => argument !== '--release' && argument !== '--unsigned')) {
    throw new TypeError('Usage: <script> [--release | --unsigned]');
  }
  const release = arguments_.includes('--release');
  const unsigned = arguments_.includes('--unsigned');
  if (release && unsigned) {
    throw new TypeError('--release and --unsigned cannot be used together');
  }
  return { release, unsigned };
};
